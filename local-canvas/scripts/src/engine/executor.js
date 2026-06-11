import { spawn } from 'node:child_process';
import vm from 'node:vm';
import path from 'node:path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

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
    throw new Error('Workflow contains a cycle 鈥?cannot execute');
  }

  onLog('info', `Workflow execution started with ${sorted.length} nodes in order`);

  // Build adjacency data: which edges feed into which node
  const nodeOutputs = {};
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
          });

          outputs[node.id] = result;
          onLog('debug', `Node ${node.id} output type: ${typeof result}, isEmpty: ${JSON.stringify(result) === '{}' ? 'YES' : 'NO'}`);
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

    if (batchResults.some(r => r === undefined)) break; // error occurred
  }

  // 3. Collect all node outputs structured
  const outputFiles = sorted.map(node => {
    const data = outputs[node.id];
    if (data === undefined || data === null) return null;
    return {
      nodeId: node.id,
      nodeName: node.data?.label || node.type,
      nodeType: node.type,
      content: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
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
async function executeNode(node, inputData, { skills, adapters, onLog, timeout, retryCount, retryDelay }) {
  const nodeType = node.type || node.data?.type;

  if (nodeType === 'skill') {
    return executeSkillNode(node, inputData, skills, adapters, onLog, timeout, retryCount, retryDelay);
  } else if (nodeType === 'llm' || nodeType === 'ai' || nodeType === 'model') {
    return executeLLMNode(node, inputData, adapters, onLog, timeout);
  } else if (nodeType === 'input') {
    return node.data?.input || inputData || {};
  } else if (nodeType === 'output') {
    return inputData;
  } else if (nodeType === 'code') {
    return executeCodeNode(node, inputData, onLog, timeout);
  } else {
    throw new Error(`Unknown node type "${nodeType}". Supported types: model, llm, ai, skill, api, input, output, code`);
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
    let description = skill.description;

    // 如果 description 为空，直接从 SKILL.md 文件读取全文作为技能定义
    if (!description && skill.path) {
      try {
        const mdPath = path.join(skill.path, 'SKILL.md');
        description = fs.readFileSync(mdPath, 'utf8');
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

  const sandbox = { input: inputData, onLog, console };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(code);

  const result = script.runInContext(context, { timeout: timeout || 5000 });
  return result ?? {};
}

// 鈹€鈹€ Helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function topologicalSort(nodes, edges) {
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
  if (incomingEdges.length === 0) return {};

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
      // No mapping: merge the whole output
      Object.assign(input, typeof sourceOutput === 'object' ? sourceOutput : { value: sourceOutput });
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

function spawnSubprocess(entryPath, entryType, inputJson, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Subprocess timed out after ${timeout}ms`));
    }, timeout);

    let cmd, args;
    if (entryType === 'python') {
      cmd = process.platform === 'win32' ? 'python' : 'python3';
      args = [entryPath];
    } else if (entryType === 'node') {
      cmd = 'node';
      args = [entryPath];
    } else if (entryType === 'shell') {
      if (process.platform === 'win32') {
        cmd = 'cmd.exe';
        args = ['/c', entryPath];
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

export default { executeWorkflow };
