import { spawn } from 'node:child_process';
import vm from 'node:vm';
import path from 'node:path';
import fs from 'fs-extra';

/**
 * Workflow Execution Engine
 *
 * Takes a workflow definition (nodes + edges), performs topological sort,
 * executes nodes with parallel support, passes data through connections,
 * and optionally converts output to a specified format.
 */

const DEFAULT_TIMEOUT = 60_000; // ms
const DEFAULT_RETRY_COUNT = 0;
const DEFAULT_RETRY_DELAY = 1000; // ms

/**
 * Execute a workflow.
 *
 * @param {object} params
 * @param {object} params.workflow - { nodes: [], edges: [] }
 * @param {object} params.skills - Map of skill_id -> skill config
 * @param {object} params.adapters - Map of model_id -> adapter instance
 * @param {function} params.onLog - (level, message) => void
 * @param {object} params.options - { timeout, retryCount, retryDelay }
 * @returns {Promise<{success:boolean, results:object[], outputFiles:string[]}>}
 */
export async function executeWorkflow({
  workflow,
  skills = {},
  adapters = {},
  onLog = () => {},
  options = {},
}) {
  const { nodes, edges } = workflow;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;

  // 1. Topological sort
  const sorted = topologicalSort(nodes, edges);
  if (!sorted) {
    throw new Error('Workflow contains a cycle — cannot execute');
  }

  onLog('info', `Workflow execution started with ${sorted.length} nodes in order`);

  // Build adjacency data: which edges feed into which node
  const results = [];

  // 2. Execute in topological order (parallel for independent nodes)
  const inDegree = {};
  const dependents = {};
  const nodeMap = {};

  for (const node of sorted) {
    nodeMap[node.id] = node;
    inDegree[node.id] = 0;
    dependents[node.id] = [];
  }

  for (const edge of edges) {
    if (inDegree[edge.target] !== undefined) {
      inDegree[edge.target]++;
    }
    if (dependents[edge.source]) {
      dependents[edge.source].push(edge);
    }
  }

  const queue = [];
  const executed = new Set();
  const outputs = {};

  // Start with nodes that have no dependencies
  for (const node of sorted) {
    if (inDegree[node.id] === 0) {
      queue.push(node);
    }
  }

  while (queue.length > 0) {
    const currentBatch = [...queue];
    queue.length = 0;

    // Execute current batch in parallel
    const batchResults = await Promise.all(
      currentBatch.map(async (node) => {
        if (executed.has(node.id)) return;
        executed.add(node.id);

        try {
          // Compute input from incoming edges
          const inputData = buildNodeInput(node, edges, outputs);

          const result = await executeNode(node, inputData, {
            skills,
            adapters,
            onLog,
            timeout,
            retryCount,
            retryDelay,
            outputDir: options.outputDir,
          });

          outputs[node.id] = result;
          onLog('debug', `Node ${node.id} output type: ${typeof result}, isEmpty: ${result && typeof result === 'object' && Object.keys(result).length === 0 ? 'YES' : 'NO'}`);
          results.push({ nodeId: node.id, nodeName: node.data?.label || node.type, success: true, output: result });
          onLog('info', `Node "${node.data?.label || node.id}" completed successfully`);

          // Add dependents whose all dependencies are now satisfied
          for (const edge of dependents[node.id] || []) {
            inDegree[edge.target]--;
            if (inDegree[edge.target] === 0 && !executed.has(edge.target)) {
              const targetNode = nodeMap[edge.target];
              if (targetNode) queue.push(targetNode);
            }
          }
          return result;
        } catch (err) {
          results.push({ nodeId: node.id, nodeName: node.data?.label || node.type, success: false, error: err.message });
          onLog('error', `Node "${node.data?.label || node.id}" failed: ${err.message}`);
          throw err; // fail the workflow
        }
      })
    );

  }

  // 3. Collect all node outputs structured
  const outputFiles = sorted.map(node => {
    const data = outputs[node.id];
    if (data === undefined || data === null) return null;
    const nodeType = node.type || node.data?.type;
    return {
      nodeId: node.id,
      nodeName: node.data?.label || node.type,
      nodeType,
      content: nodeType === 'file_output' && data.filePath
        ? data.filePath
        : typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    };
  }).filter(Boolean);

  onLog('info', 'Workflow execution completed');

  return {
    success: true,
    results,
    outputFiles,
  };
}

/**
 * Execute a single node.
 */
async function executeNode(node, inputData, { skills, adapters, onLog, timeout, retryCount, retryDelay, outputDir }) {
  const nodeType = node.type || node.data?.type;

  if (nodeType === 'skill') {
    return executeSkillNode(node, inputData, skills, adapters, onLog, timeout, retryCount, retryDelay);
  } else if (nodeType === 'llm' || nodeType === 'ai' || nodeType === 'model') {
    return executeLLMNode(node, inputData, adapters, onLog, timeout);
  } else if (nodeType === 'input') {
    return node.data?.input || inputData || {};
  } else if (nodeType === 'output') {
    return inputData;
  } else if (nodeType === 'knowledge') {
    // Knowledge node passes through upstream data for RAG-style processing
    return inputData;
  } else if (nodeType === 'code') {
    return executeCodeNode(node, inputData, onLog, timeout);
  } else if (nodeType === 'file_output') {
    return executeFileOutputNode(node, inputData, onLog, { outputDir });
  } else {
    throw new Error(`Unknown node type "${nodeType}". Supported types: model, llm, ai, skill, input, output, code, file_output`);
  }
}

/**
 * Execute a skill node by spawning a subprocess.
 */
async function executeSkillNode(node, inputData, skills, adapters, onLog, timeout, retryCount, retryDelay) {
  const skillId = node.data?.skillId || node.data?.skill_id;
  const skill = skills[skillId];

  if (!skill) {
    throw new Error(`Skill "${skillId}" not found`);
  }

  // 没有可执行脚本但有描述 → 用 model 执行（SKILL.md 自动发现技能）
  if (!skill.entry || !skill.entryType) {
    // discovered 类型技能：直接用 SKILL.md 作为 system prompt
    if (skill.type === 'discovered') {
      return executeLLMSkill(node, inputData, skill, adapters, onLog, timeout, retryCount, retryDelay);
    }

    let description = skill.description;

    // 如果 description 为空，直接从 SKILL.md 文件读取全文作为技能定义
    if (!description && skill.path) {
      try {
        const mdPath = path.join(skill.path, 'SKILL.md');
        description = await fs.readFile(mdPath, 'utf8');
        if (description) {
          onLog('info', `Loaded SKILL.md content for "${skill.name}" (${description.length} chars)`);
        }
      } catch {
        // 读不到文件才报错
      }
    }

    if (!description) {
      throw new Error(`Skill "${skill.name}" has no entry and no description`);
    }
    onLog('info', `Executing prompt-based skill "${skill.name}" via LLM...`);

    // 找任意可用 adapter（优先 builtin）
    const adapter = adapters['builtin']
      || Object.values(adapters).find(a => a && typeof a.chat === 'function');

    if (!adapter) {
      throw new Error(`Skill "${skill.name}" requires an AI model but none is available`);
    }

    const messages = [
      { role: 'system', content: `你是技能的执行器。严格按照以下技能定义工作：\n\n## 技能名称\n${skill.name}\n\n## 技能描述\n${description}\n\n## 输入规范\n${JSON.stringify(skill.input_schema || {})}\n\n## 输出规范\n${JSON.stringify(skill.output_schema || {})}\n\n用 JSON 格式返回结果。` },
      { role: 'user', content: `输入数据：${typeof inputData === 'string' ? inputData : JSON.stringify(inputData)}` }
    ];

    const result = await adapter.chat(messages, { temperature: 0.3, max_tokens: 2048, timeout });
    onLog('info', `Prompt-based skill "${skill.name}" completed`);

    // 尝试解析 LLM 返回的 JSON
    try {
      return JSON.parse(result.content);
    } catch {
      return { result: result.content };
    }
  }

  const entryPath = skill.entry;
  if (!entryPath) {
    throw new Error(`Skill "${skillId}" has no entry point defined`);
  }

  const fullEntryPath = path.isAbsolute(entryPath)
    ? entryPath
    : path.join(skill.path || '', entryPath);

  let lastError;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    if (attempt > 0) {
      onLog('warn', `Retrying skill "${skillId}" (attempt ${attempt + 1}/${retryCount + 1})`);
      await sleep(retryDelay);
    }

    try {
      const mergedInput = { ...(node.data?.config || {}), ...(inputData || {}) };
      const inputJson = JSON.stringify(mergedInput);
      const result = await spawnSubprocess(fullEntryPath, skill.entryType || 'python', inputJson, timeout);
      return typeof result === 'string' ? safeParseJson(result) : result;
    } catch (err) {
      lastError = err;
      onLog('warn', `Skill "${skillId}" attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  throw lastError || new Error(`Skill "${skillId}" execution failed after ${retryCount + 1} attempts`);
}

/**
 * Execute an LLM node via the model adapter.
 */
async function executeLLMNode(node, inputData, adapters, onLog, timeout) {
  const modelId = node.data?.modelId || node.data?.model_id;

  // Debug: trace adapter lookup
  onLog('debug', `executeLLMNode: modelId=${modelId}, type=${typeof modelId}`);
  onLog('debug', `Available adapter keys: ${Object.keys(adapters).join(',') || '(none)'} (types: ${Object.keys(adapters).map(k => typeof k).join(',') || 'none'})`);

  const adapter = modelId ? adapters[modelId] : null;
  onLog('debug', `Adapter lookup result: ${modelId ? (adapter ? 'FOUND' : 'NOT FOUND') : 'no modelId'}`);

  if (!adapter) {
    throw new Error(`Model adapter "${modelId}" not found. Available: [${Object.keys(adapters).join(', ')}]`);
  }

  const systemPrompt = node.data?.systemPrompt || node.data?.system_prompt || '';
  const userPrompt = node.data?.prompt || inputData?.prompt || inputData?.input || JSON.stringify(inputData);

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt) });

  onLog('info', `Calling LLM model "${adapter.name || modelId}"...`);

  const result = await adapter.chat(messages, {
    temperature: node.data?.temperature ?? 0.7,
    max_tokens: node.data?.maxTokens ?? node.data?.max_tokens ?? 2048,
    timeout,
  });

  // Debug: inspect actual return
  onLog('debug', `LLM raw result keys: ${Object.keys(result).join(', ')}`);
  onLog('debug', `LLM content (first 200 chars): ${(result.content || '').substring(0, 200)}`);

  return { content: result.content, usage: result.usage };
}

/**
 * Execute a code node (inline JavaScript evaluated in a sandbox via node:vm).
 */
async function executeCodeNode(node, inputData, onLog, timeout) {
  const code = node.data?.code || '';
  if (!code) return inputData || {};

  const sandboxConsole = {
    log: (...args) => onLog('info', `[code] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    error: (...args) => onLog('error', `[code] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    warn: (...args) => onLog('warn', `[code] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
  };
  const sandbox = { input: inputData, onLog, console: sandboxConsole };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(code);

  const result = script.runInContext(context, { timeout: timeout || 5000, breakOnSigint: true });
  return result ?? {};
}

/**
 * Execute a file_output node — write upstream data to a file on disk.
 *
 * @param {object} node
 * @param {object} inputData - upstream node output
 * @param {function} onLog
 * @returns {Promise<{filePath:string, format:string, fileName:string, size:number}>}
 */
async function executeFileOutputNode(node, inputData, onLog, options = {}) {
  const format = node.data?.config?.format || node.data?.format || 'json';
  const outputDir = node.data?.config?.outputDir || node.data?.outputDir || options.outputDir || path.resolve(process.cwd(), 'output');
  const rawName = node.data?.config?.fileName || node.data?.fileName || '';
  let baseName = rawName
    ? rawName.replace(/[/\\:*?"<>|]/g, '_').replace(/\.\./g, '_').replace(/[\x00-\x1F]/g, '')
    : `output_${Date.now()}`;
  if (rawName && !baseName) baseName = `output_${Date.now()}`;
  baseName = baseName.replace(/[<>:"/\\|?*]/g, '_');
  const template = node.data?.config?.template || node.data?.template || '';

  const actualData = (inputData && typeof inputData === 'object' && 'content' in inputData)
    ? inputData.content
    : inputData;

  await fs.ensureDir(outputDir);

  const extMap = {
    json: '.json', csv: '.csv', html: '.html', md: '.md', txt: '.txt',
    png: '.png', jpg: '.jpg', jpeg: '.jpeg', gif: '.gif', webp: '.webp',
    svg: '.svg', mp4: '.mp4', webm: '.webm', mov: '.mov'
  };
  const ext = extMap[format] || `.${format}`;
  const filePath = path.join(outputDir, `${baseName}${ext}`);

  if (format === 'svg') {
    const svgContent = typeof actualData === 'string' ? actualData : actualData?.data || actualData?.svg || JSON.stringify(actualData);
    await fs.writeFile(filePath, svgContent, 'utf8');
    const stat = await fs.stat(filePath);
    onLog('info', `File written: ${filePath} (${stat.size} bytes, format=svg)`);
    return { filePath, format, fileName: baseName + ext, size: stat.size };
  }

  const binaryFormats = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov'];
  if (binaryFormats.includes(format)) {
    let data = actualData?.data || actualData?.base64 || actualData;
    if (typeof data === 'string') data = data.replace(/\s/g, '');
    try {
      await fs.writeFile(filePath, Buffer.from(data, 'base64'));
    } catch (err) {
      throw new Error(`Invalid base64 data for format "${format}": ${err.message}`);
    }
    const stat = await fs.stat(filePath);
    onLog('info', `File written: ${filePath} (${stat.size} bytes, format=${format})`);
    return { filePath, format, fileName: baseName + ext, size: stat.size };
  }

  let content;
  if (format === 'json') {
    content = JSON.stringify(actualData, null, 2);
  } else if (format === 'csv') {
    content = toCsv(actualData);
  } else if (format === 'html') {
    let htmlContent = typeof actualData === 'string' ? actualData : '';
    // 先去掉所有非 HTML 前缀（中文介绍、markdown fences 等），直接定位到 <!DOCTYPE 或 <html
    htmlContent = htmlContent.replace(/^[\s\S]*?(<!DOCTYPE\s+html|<html\b)/i, '$1');
    // 去掉末尾的 markdown fence 闭合
    htmlContent = htmlContent.replace(/\n```\s*$/i, '');
    const isFullHtml = /^\s*(<!DOCTYPE|<html)/i.test(htmlContent);
    if (isFullHtml) {
      content = htmlContent;
    } else {
      content = template
        ? renderTemplate(template, actualData)
        : wrapHtml(typeof actualData === 'string' ? actualData : JSON.stringify(actualData, null, 2));
    }
  } else if (format === 'md') {
    content = template
      ? renderTemplate(template, actualData)
      : toMarkdown(actualData);
  } else if (format === 'txt') {
    content = typeof actualData === 'string' ? actualData : JSON.stringify(actualData, null, 2);
  } else {
    // Unknown format: write as JSON with metadata
    content = JSON.stringify({ format, data: actualData, note: `Format "${format}" requires a skill for native generation` }, null, 2);
  }

  await fs.writeFile(filePath, content, 'utf8');
  const stat = await fs.stat(filePath);

  onLog('info', `File written: ${filePath} (${stat.size} bytes, format=${format})`);
  return { filePath, format, fileName: baseName + ext, size: stat.size };
}

/**
 * Convert an array of objects to CSV string.
 */
function toCsv(data) {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.map(csvEscape).join(',');
  const body = rows.map(row => keys.map(k => csvEscape(row[k] ?? '')).join(','));
  return [header, ...body].join('\n');
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Render {{key}} placeholders in a template with values from data.
 */
function renderTemplate(tmpl, data) {
  return tmpl.replace(/\{\{\s*(\S+?)\s*\}\}/g, (_, key) => {
    const val = getNestedValue(data, key);
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

function wrapHtml(body) {
  return `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Output</title></head>\n<body>\n${body}\n</body>\n</html>`;
}

/**
 * Convert input data to a simple Markdown key-value listing.
 */
function toMarkdown(data) {
  if (typeof data === 'string') return data;
  if (typeof data !== 'object' || data === null) return String(data);
  const lines = [];
  for (const [k, v] of Object.entries(data)) {
    const val = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    lines.push(`- **${k}**: ${val}`);
  }
  return lines.join('\n');
}

// Helpers

export function topologicalSort(nodes, edges) {
  const adj = {};
  const inDeg = {};

  for (const node of nodes) {
    adj[node.id] = [];
    inDeg[node.id] = 0;
  }

  for (const edge of edges) {
    if (adj[edge.source]) {
      adj[edge.source].push(edge.target);
      inDeg[edge.target] = (inDeg[edge.target] || 0) + 1;
    }
  }

  const queue = [];
  for (const node of nodes) {
    if (inDeg[node.id] === 0) {
      queue.push(node);
    }
  }

  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);

    for (const neighbor of adj[node.id] || []) {
      inDeg[neighbor]--;
      if (inDeg[neighbor] === 0) {
        const next = nodes.find(n => n.id === neighbor);
        if (next) queue.push(next);
      }
    }
  }

  if (sorted.length !== nodes.length) return null; // cycle detected
  return sorted;
}

function buildNodeInput(node, edges, outputs) {
  const incomingEdges = edges.filter(e => e.target === node.id);
  if (incomingEdges.length === 0) return node.data?.config || {};

  const input = {};
  for (const edge of incomingEdges) {
    const sourceOutput = outputs[edge.source];
    if (sourceOutput === undefined) continue;

    // Apply field mapping if specified
    const mapping = edge.data?.mapping || edge.mapping;
    if (mapping) {
      for (const [targetField, sourceField] of Object.entries(mapping)) {
        input[targetField] = getNestedValue(sourceOutput, sourceField);
      }
    } else {
      // No mapping: merge the whole output, keyed by source node id to prevent overwrite
      if (typeof sourceOutput === 'object' && sourceOutput !== null) {
        input[edge.source] = sourceOutput;
        // Also shallow-merge for backward compatibility
        Object.assign(input, sourceOutput);
      } else {
        input.value = sourceOutput;
      }
    }
  }

  return input;
}

function getNestedValue(obj, path) {
  if (!path || typeof path !== 'string') return obj;
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return { output: str };
  }
}

/**
 * Execute a discovered skill via LLM — reads SKILL.md as system prompt.
 *
 * @param {object} node
 * @param {object} inputData
 * @param {object} skillConfig - { name, path, type: 'discovered', ... }
 * @param {object} adapters
 * @param {function} onLog
 * @param {number} timeout
 * @param {number} retryCount
 * @param {number} retryDelay
 * @returns {Promise<object>}
 */
async function executeLLMSkill(node, inputData, skillConfig, adapters, onLog, timeout, retryCount, retryDelay) {
  // 1. 读取 SKILL.md 作为 systemPrompt
  const mdPath = path.join(skillConfig.path, 'SKILL.md');
  let systemPrompt;
  try {
    systemPrompt = fs.readFileSync(mdPath, 'utf8');
  } catch {
    throw new Error(`Discovered skill "${skillConfig.name}": SKILL.md not found at ${mdPath}`);
  }
  if (!systemPrompt || !systemPrompt.trim()) {
    throw new Error(`Discovered skill "${skillConfig.name}": SKILL.md is empty`);
  }
  onLog('info', `Executing discovered skill "${skillConfig.name}" via LLM (SKILL.md: ${systemPrompt.length} chars)`);

  // 2. 构造 userPrompt
  const userPrompt = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);

  // 3. 选择 adapter（优先 config 中指定的 model_id，其次 builtin，再取第一个可用）
  const preferredModel = node.data?.config?.model_id || node.data?.model_id;
  let adapter;
  if (preferredModel && adapters[preferredModel]) {
    adapter = adapters[preferredModel];
  } else {
    adapter = adapters['builtin']
      || Object.values(adapters).find(a => a && typeof a.chat === 'function');
  }
  if (!adapter) {
    throw new Error(`Discovered skill "${skillConfig.name}" requires an AI model but none is available`);
  }

  // 4. 调用 LLM
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  let lastError;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    if (attempt > 0) {
      onLog('warn', `Retrying discovered skill "${skillConfig.name}" (attempt ${attempt + 1}/${retryCount + 1})`);
      await sleep(retryDelay);
    }
    try {
      const result = await adapter.chat(messages, {
        temperature: node.data?.config?.temperature ?? 0.3,
        max_tokens: node.data?.config?.max_tokens ?? 4096,
        timeout,
      });
      onLog('info', `Discovered skill "${skillConfig.name}" completed`);
      // 5. 用 safeParseJson 解析输出
      return safeParseJson(result.content);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Discovered skill "${skillConfig.name}" execution failed after ${retryCount + 1} attempts`);
}

function spawnSubprocess(entryPath, entryType, inputJson, timeout) {
  return new Promise((resolve, reject) => {
    let cmd, args;
    if (entryType === 'python') {
      if (process.platform === 'win32') {
        const candidates = ['python3', 'python', 'py'];
        cmd = null;
        for (const c of candidates) {
          try {
            require('child_process').execSync(`"${c}" --version`, { stdio: 'ignore', timeout: 3000 });
            cmd = c;
            break;
          } catch {}
        }
        if (!cmd) {
          reject(new Error(`Python not found (tried: ${candidates.join(', ')})`));
          return;
        }
      } else {
        cmd = 'python3';
      }
      args = [entryPath];
    } else if (entryType === 'node') {
      cmd = 'node';
      args = [entryPath];
    } else if (entryType === 'shell') {
      if (process.platform === 'win32') {
        cmd = 'cmd.exe';
        args = ['/d', '/c', entryPath.includes(' ') ? `"${entryPath}"` : entryPath];
      } else {
        cmd = '/bin/sh';
        args = [entryPath];
      }
    } else {
      cmd = entryPath;
      args = [];
    }

    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, INPUT: inputJson, PYTHONIOENCODING: 'utf-8' },
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Subprocess timed out after ${timeout}ms`));
    }, timeout);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Subprocess exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Also send input via stdin
    child.stdin.write(inputJson);
    child.stdin.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { executeWorkflow, topologicalSort, buildNodeInput };
