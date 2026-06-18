import { topologicalSort } from '../engine/executor.js';
import fs from 'fs-extra';
import path from 'node:path';

const SUPPORTED_OUTPUT_FORMATS = [
  'json', 'csv', 'html', 'md', 'txt',
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'svg', 'mp4', 'webm', 'mov'
];

const FORBIDDEN_SYSTEM_DIRS = new Set([
  path.resolve('C:\\Windows'),
  path.resolve('C:\\Windows\\System32'),
  '/etc', '/bin', '/usr', '/sys', '/proc', '/dev'
]);

function normalize(p) {
  return p ? path.resolve(p).replace(/\\/g, '/') : '';
}

export function reviewPreExecution(workflowDef, skillsList, modelsList) {
  const { nodes, edges } = workflowDef;
  const sections = [
    reviewStructure(nodes, edges),
    reviewConfig(nodes, skillsList, modelsList),
    reviewSecurity(nodes),
  ];

  const hasError = sections.some(s => s.status === 'fail');
  const hasWarning = sections.some(s => s.status === 'warn');
  const status = hasError ? 'fail' : hasWarning ? 'warn' : 'pass';

  const sectionStatuses = sections.map(s => `${s.name}:${s.status}`).join(', ');
  const issueCount = sections.reduce((sum, s) => sum + s.issues.length, 0);
  const summary = `Review ${status}: ${sections.length} sections, ${issueCount} issues (${sectionStatuses})`;

  return { status, summary, sections };
}

export function reviewPostExecution(outputFiles) {
  const issues = [];
  const fileOutputs = outputFiles.filter(f => f && f.nodeType === 'file_output');

  for (const fo of fileOutputs) {
    const fp = fo.filePath || (typeof fo.content === 'string' && fo.content);
    if (fp) {
      if (!fs.pathExistsSync(fp)) {
        issues.push({
          severity: 'warning',
          nodeId: fo.nodeId,
          message: `Output file not found: ${fp}`,
          suggestion: 'Check if the file_output node wrote to the expected directory'
        });
      } else {
        try {
          const stat = fs.statSync(fp);
          if (stat.size === 0) {
            issues.push({
              severity: 'warning',
              nodeId: fo.nodeId,
              message: `Output file is empty: ${fp}`,
              suggestion: 'Check the upstream data for this file_output node'
            });
          }
          const ext = path.extname(fp).toLowerCase();
          if (ext === '.json' && stat.size > 0) {
            try {
              const content = fs.readFileSync(fp, 'utf8');
              JSON.parse(content);
            } catch {
              issues.push({
                severity: 'error',
                nodeId: fo.nodeId,
                message: `Output JSON file is malformed: ${fp}`,
                suggestion: 'Ensure the upstream data is valid JSON'
              });
            }
          }
        } catch {
          console.warn(`[Reviewer] Failed to stat output file: ${fp}`);
        }
      }
    }
    if (fo.size === 0) {
      issues.push({
        severity: 'warning',
        nodeId: fo.nodeId,
        message: `Output file size is 0 bytes`,
        suggestion: 'The upstream node may not have produced data'
      });
    }
  }

  const severity = issues.some(i => i.severity === 'error') ? 'fail'
    : issues.some(i => i.severity === 'warning') ? 'warn' : 'pass';

  const section = {
    name: '产出审查',
    status: severity,
    issues,
  };

  const summary = `Post-execution review ${severity}: ${issues.length} issues in ${fileOutputs.length} output files`;
  return { status: severity, summary, sections: [section] };
}

function reviewStructure(nodes, edges) {
  const issues = [];

  if (nodes.length === 0) {
    issues.push({
      severity: 'error',
      message: 'Workflow has no nodes',
      suggestion: 'Add at least one node to the canvas'
    });
    return { name: '结构校验', status: 'fail', issues };
  }

  const sorted = topologicalSort(nodes, edges);
  if (!sorted) {
    issues.push({
      severity: 'error',
      message: 'Workflow contains a cyclic dependency',
      suggestion: 'Remove cycles in the node connections'
    });
    return { name: '结构校验', status: 'fail', issues };
  }

  const inDegree = {};
  const outDegree = {};
  for (const n of nodes) {
    inDegree[n.id] = 0;
    outDegree[n.id] = 0;
  }
  for (const e of edges) {
    if (inDegree[e.target] !== undefined) inDegree[e.target]++;
    if (outDegree[e.source] !== undefined) outDegree[e.source]++;
  }

  const allZeroIn = nodes.every(n => inDegree[n.id] === 0);
  if (allZeroIn && nodes.length > 1) {
    issues.push({
      severity: 'warning',
      message: 'All nodes have no incoming connections — nothing is wired together',
      suggestion: 'Connect nodes with edges to define data flow'
    });
  }

  const hasSink = nodes.some(n =>
    n.type === 'output' || (n.type || n.data?.type) === 'file_output'
  );
  if (!hasSink) {
    issues.push({
      severity: 'warning',
      message: 'No output or file_output node found — workflow produces no deliverable',
      suggestion: 'Add an output or file_output node as the final step'
    });
  }

  for (const n of nodes) {
    if (inDegree[n.id] === 0 && outDegree[n.id] === 0) {
      const nodeType = n.type || n.data?.type;
      if (nodeType !== 'input') {
        issues.push({
          severity: 'warning',
          nodeId: n.id,
          message: `Isolated node "${n.data?.label || n.id}" — no connections to other nodes`,
          suggestion: 'Connect this node to the workflow or remove it'
        });
      }
    }
  }

  const severity = issues.some(i => i.severity === 'error') ? 'fail'
    : issues.some(i => i.severity === 'warning') ? 'warn' : 'pass';
  return { name: '结构校验', status: severity, issues };
}

function reviewConfig(nodes, skillsList, modelsList) {
  const issues = [];
  const skillIds = new Set(skillsList.map(s => s.id));

  for (const n of nodes) {
    const nodeType = n.type || n.data?.type;
    const data = n.data || {};

    if (nodeType === 'skill') {
      const sid = data.skillId || data.skill_id;
      if (!sid || !skillIds.has(sid)) {
        issues.push({
          severity: 'error',
          nodeId: n.id,
          message: `Skill "${sid || '(none)'}" not found in available skills`,
          suggestion: 'Select a valid skill or refresh the skill list'
        });
      }
      const skill = skillsList.find(s => s.id === sid);
      if (skill && skill.entry) {
        const entryPath = path.isAbsolute(skill.entry)
          ? skill.entry
          : path.join(skill.path || '', skill.entry);
        if (!fs.pathExistsSync(entryPath)) {
          issues.push({
            severity: 'error',
            nodeId: n.id,
            message: `Skill entry script not found: ${entryPath}`,
            suggestion: 'Check that the skill file exists on disk'
          });
        }
      }
    }

    if (nodeType === 'llm' || nodeType === 'ai' || nodeType === 'model') {
      const mid = data.modelId || data.model_id;
      const model = modelsList.find(m => String(m.id) === String(mid));
      if (!model) {
        issues.push({
          severity: 'error',
          nodeId: n.id,
          message: `Model "${mid || '(none)'}" not found or not active`,
          suggestion: 'Select an active model or add one in Settings'
        });
      } else if (!model.is_active) {
        issues.push({
          severity: 'error',
          nodeId: n.id,
          message: `Model "${model.name}" is not active`,
          suggestion: 'Activate the model in Settings'
        });
      }
    }

    if (nodeType === 'code') {
      const code = data.code || '';
      if (!code.trim()) {
        issues.push({
          severity: 'warning',
          nodeId: n.id,
          message: 'Code node has empty code field',
          suggestion: 'Enter JavaScript code to execute'
        });
      }
    }

    if (nodeType === 'file_output') {
      const format = data.config?.format || data.format || 'json';
      if (!SUPPORTED_OUTPUT_FORMATS.includes(format)) {
        issues.push({
          severity: 'error',
          nodeId: n.id,
          message: `Unsupported output format: "${format}"`,
          suggestion: `Use one of: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`
        });
      }
    }
  }

  const severity = issues.some(i => i.severity === 'error') ? 'fail'
    : issues.some(i => i.severity === 'warning') ? 'warn' : 'pass';
  return { name: '配置校验', status: severity, issues };
}

function reviewSecurity(nodes) {
  const issues = [];
  const DANGEROUS_PATTERNS = [
    'fs.', 'require(', 'child_process',
    'process.exit', 'eval(', 'Function('
  ];

  // Network safety: flag API nodes hitting internal/private IPs
  const PRIVATE_IP_RANGES = [
    /^https?:\/\/10\.\d+\.\d+\.\d+/,
    /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
    /^https?:\/\/192\.168\.\d+\.\d+/,
    /^https?:\/\/127\.\d+\.\d+\.\d+/,
    /^https?:\/\/localhost/,
    /^https?:\/\/\[::1\]/,
    /^https?:\/\/0\.0\.0\.0/,
  ];

  for (const n of nodes) {
    const nodeType = n.type || n.data?.type;
    const data = n.data || {};

    if (nodeType === 'code') {
      const code = data.code || '';
      const sandboxMode = data.config?.sandbox || data.sandbox || 'docker';
      for (const pat of DANGEROUS_PATTERNS) {
        if (code.includes(pat)) {
          issues.push({
            severity: 'warning',
            nodeId: n.id,
            message: `Code node contains potentially dangerous pattern: "${pat}"`,
            suggestion: 'Avoid filesystem access, subprocesses, and dynamic code execution in code nodes'
          });
          break;
        }
      }
      // Warn about VM sandbox mode (less secure)
      if (code.trim() && sandboxMode !== 'docker') {
        issues.push({
          severity: 'warning',
          nodeId: n.id,
          message: 'Code node using in-process VM sandbox — only use trusted code',
          suggestion: 'Set sandbox mode to "docker" for full isolation. Install Docker Desktop to enable.'
        });
      }
    }

    if (nodeType === 'skill' || nodeType === 'code') {
      const timeout = data.timeout || data.config?.timeout;
      if (!timeout || timeout > 120000) {
        issues.push({
          severity: 'warning',
          nodeId: n.id,
          message: 'No timeout or timeout > 120s — long-running processes may hang the workflow',
          suggestion: 'Set a reasonable timeout (e.g. 30000-60000ms) to prevent resource exhaustion'
        });
      }
    }

    if (nodeType === 'api' || nodeType === 'api_caller') {
      const url = data.config?.url || data.url || '';
      if (url) {
        const isPrivate = PRIVATE_IP_RANGES.some(r => r.test(url));
        if (isPrivate) {
          issues.push({
            severity: 'warning',
            nodeId: n.id,
            message: `API node targets a private/internal IP: ${url}`,
            suggestion: 'Ensure this is intentional. Calls to internal services may expose local network resources.'
          });
        }
      }
    }

    if (nodeType === 'file_output') {
      const outputDir = data.config?.outputDir || data.outputDir;
      if (outputDir) {
        const normalized = normalize(outputDir);
        for (const forbidden of FORBIDDEN_SYSTEM_DIRS) {
          if (normalized.startsWith(normalize(forbidden))) {
            issues.push({
              severity: 'error',
              nodeId: n.id,
              message: `Output directory points to a system path: ${outputDir}`,
              suggestion: 'Use a safe output directory like "output/" or a project subfolder'
            });
            break;
          }
        }
      }
    }
  }

  const severity = issues.some(i => i.severity === 'error') ? 'fail'
    : issues.some(i => i.severity === 'warning') ? 'warn' : 'pass';
  return { name: '安全审查', status: severity, issues };
}
