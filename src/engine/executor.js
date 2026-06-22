/**
 * Workflow Execution Engine — slim orchestrator.
 *
 * Takes a workflow definition (nodes + edges), performs topological sort,
 * executes nodes via the Node Executor Registry, handles retry and step mode.
 */
import { getDb } from '../db.js';
import { getNodeExecutor } from './registry.js';
import { cosineSimilarity } from './utils.js';
import { config } from '../config.js';

// Import all node executors to trigger registration
import './nodes/InputOutputExecutor.js';
import './nodes/ModelExecutor.js';
import './nodes/CodeExecutor.js';
import './nodes/ApiExecutor.js';
import './nodes/KnowledgeExecutor.js';
import './nodes/ConditionExecutor.js';
import './nodes/VisionExecutor.js';
import './nodes/FileOutputExecutor.js';
import './nodes/SkillExecutor.js';
import './nodes/WorkflowSubExecutor.js';

const DEFAULT_TIMEOUT = config.execution.defaultTimeout;
const DEFAULT_RETRY_COUNT = 0;
const DEFAULT_RETRY_DELAY = config.execution.defaultRetryDelay;

function releaseDependents(nodeId, dependents, inDegree, executed, nodeMap, queue) {
  for (const edge of dependents[nodeId] || []) {
    inDegree[edge.target]--;
    if (inDegree[edge.target] === 0 && !executed.has(edge.target)) {
      const targetNode = nodeMap[edge.target];
      if (targetNode) queue.push(targetNode);
    }
  }
}

async function _executeAndRecord(node, ctx, results) {
  const { edges, outputs, dependents, inDegree, executed, nodeMap, queue, ...execOpts } = ctx;
  const onLog = execOpts.onLog || (() => {});

  try {
    const inputData = buildNodeInput(node, edges, outputs);
    const result = await executeNode(node, inputData, execOpts);

    outputs[node.id] = result;
    results.push({ nodeId: node.id, nodeName: node.data?.label || node.type, success: true, output: result });
    onLog('info', `✓ ${node.data?.label || node.id} execution complete`);

    releaseDependents(node.id, dependents, inDegree, executed, nodeMap, queue);
  } catch (err) {
    const continueOnError = node.data?.config?.continueOnError || node.data?.continueOnError;
    results.push({
      nodeId: node.id, nodeName: node.data?.label || node.type,
      success: !!continueOnError, error: err.message,
      optionalFailed: !!continueOnError,
    });
    if (continueOnError) {
      onLog('warn', `⚠ ${node.data?.label || node.id} failed but skipped (optional): ${err.message}`);
    } else {
      onLog('error', `✗ ${node.data?.label || node.id} failed: ${err.message}`);
    }
    outputs[node.id] = null;
  }
}

export async function executeWorkflow({
  workflow, skills = {}, adapters = {}, onLog = () => {}, options = {},
}) {
  const { nodes, edges } = workflow;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
  const mode = options.mode || 'auto';
  const stepControl = options.stepControl;

  const sorted = topologicalSort(nodes, edges);
  if (!sorted) throw new Error('Workflow contains a cycle — cannot execute');

  onLog('info', `Starting workflow, ${sorted.length} nodes total`);

  const results = [];
  const inDegree = {};
  const dependents = {};
  const nodeMap = {};

  for (const node of sorted) {
    nodeMap[node.id] = node;
    inDegree[node.id] = 0;
    dependents[node.id] = [];
  }

  for (const edge of edges) {
    if (inDegree[edge.target] !== undefined) inDegree[edge.target]++;
    if (dependents[edge.source]) dependents[edge.source].push(edge);
  }

  const queue = [];
  const executed = new Set();
  const outputs = {};

  for (const node of sorted) {
    if (inDegree[node.id] === 0) queue.push(node);
  }

  while (queue.length > 0) {
    const currentBatch = [...queue];
    queue.length = 0;

    for (const node of currentBatch) {
      if (executed.has(node.id)) continue;
      const useStepMode = mode === 'step' && stepControl;

      if (useStepMode) {
        const inputData = buildNodeInput(node, edges, outputs);
        const action = await stepControl.waitForStep(node, inputData, executed.size);
        if (action === 'stop') {
          onLog('warn', `Execution stopped by user at node ${node.data?.label || node.id}`);
          results.push({ nodeId: '__stopped__', nodeName: 'STOPPED', success: false, error: 'User stopped execution' });
          return { success: false, results, outputFiles: [] };
        }
        if (action === 'skip') {
          onLog('info', `⊘ ${node.data?.label || node.id} skipped`);
          results.push({ nodeId: node.id, nodeName: node.data?.label || node.type, success: true, output: null, skipped: true });
          executed.add(node.id);
          releaseDependents(node.id, dependents, inDegree, executed, nodeMap, queue);
          continue;
        }
      }

      executed.add(node.id);
      await _executeAndRecord(node, {
        edges, outputs, skills, adapters, onLog, timeout, retryCount, retryDelay,
        outputDir: options.outputDir, workflowId: options.workflowId, executionId: options.executionId,
        getVar: (key) => getWorkflowVar(key, options.workflowId, options.executionId),
        setVar: (key, value) => setWorkflowVar(key, value, options.workflowId, options.executionId),
        dependents, inDegree, executed, nodeMap, queue,
      }, results);
    }
  }

  const outputFiles = sorted.map(node => {
    const data = outputs[node.id];
    if (data === undefined || data === null) return null;
    const nodeType = node.type || node.data?.type;
    return {
      nodeId: node.id, nodeName: node.data?.label || node.type, nodeType,
      content: nodeType === 'file_output' && data.filePath ? data.filePath
        : typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    };
  }).filter(Boolean);

  onLog('info', 'Workflow execution complete');

  const allPassed = results.every(r => r.success || r.optionalFailed);
  return { success: allPassed, results, outputFiles };
}

async function executeNode(node, inputData, ctx) {
  const nodeType = node.type || node.data?.type;
  const { onLog, timeout, retryCount, retryDelay } = ctx;
  const nodeRetryCount = node.data?.config?.retryCount ?? node.data?.retryCount ?? retryCount;
  const nodeRetryDelay = node.data?.config?.retryDelay ?? node.data?.retryDelay ?? retryDelay;

  const executor = getNodeExecutor(nodeType);
  const label = node.data?.label || nodeType;
  return withRetry(() => executor.execute(node, inputData, ctx), nodeRetryCount, nodeRetryDelay, label, onLog);
}

async function withRetry(fn, maxRetries, delayMs, label, onLog) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) onLog('warn', `🔄 Retry "${label}" (${attempt}/${maxRetries})`);
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        onLog('warn', `⚠ "${label}" failed: ${err.message}, retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }
  onLog('error', `✗ "${label}" still failed after ${maxRetries + 1} attempts: ${lastError.message}`);
  throw lastError;
}

// ── Helpers ──

export function topologicalSort(nodes, edges) {
  const adj = {};
  const inDeg = {};
  for (const node of nodes) { adj[node.id] = []; inDeg[node.id] = 0; }
  for (const edge of edges) {
    if (adj[edge.source]) { adj[edge.source].push(edge.target); inDeg[edge.target] = (inDeg[edge.target] || 0) + 1; }
  }
  const queue = [];
  for (const node of nodes) { if (inDeg[node.id] === 0) queue.push(node); }
  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    for (const neighbor of adj[node.id] || []) {
      inDeg[neighbor]--;
      if (inDeg[neighbor] === 0) { const next = nodes.find(n => n.id === neighbor); if (next) queue.push(next); }
    }
  }
  if (sorted.length !== nodes.length) return null;
  return sorted;
}

export function buildNodeInput(node, edges, outputs) {
  const incomingEdges = edges.filter(e => e.target === node.id);
  if (incomingEdges.length === 0) return node.data?.config || {};

  const input = {};
  for (const edge of incomingEdges) {
    const sourceOutput = outputs[edge.source];
    if (sourceOutput === undefined) continue;
    const mapping = edge.data?.mapping || edge.mapping;
    if (mapping) {
      for (const [targetField, sourceField] of Object.entries(mapping)) {
        input[targetField] = getNestedValue(sourceOutput, sourceField);
      }
    } else {
      if (typeof sourceOutput === 'object' && sourceOutput !== null) {
        input[edge.source] = sourceOutput;
        for (const [k, v] of Object.entries(sourceOutput)) {
          if (v === null || typeof v !== 'object') { input[k] = v; }
          else if (Array.isArray(v)) {
            input[k] = v.map(item =>
              item && typeof item === 'object' && !Array.isArray(item)
                ? Object.fromEntries(Object.entries(item).map(([kk, vv]) => [kk, (vv !== null && typeof vv === 'object' && !Array.isArray(vv)) ? '[nested]' : vv]))
                : item
            );
          }
        }
        if (sourceOutput.content !== undefined && typeof sourceOutput.content !== 'object') {
          input.content = sourceOutput.content;
        }
      } else { input.value = sourceOutput; }
    }
  }
  return input;
}

function getNestedValue(obj, path) {
  if (!path || typeof path !== 'string') return obj;
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getWorkflowVar(key, workflowId, executionId) {
  if (!workflowId && !executionId) return undefined;
  const db = getDb();
  const row = workflowId
    ? db.prepare('SELECT var_value FROM workflow_vars WHERE workflow_id = ? AND var_key = ?').get(workflowId, key)
    : db.prepare('SELECT var_value FROM workflow_vars WHERE execution_id = ? AND var_key = ?').get(executionId, key);
  return row ? row.var_value : undefined;
}

function setWorkflowVar(key, value, workflowId, executionId) {
  if (!workflowId && !executionId) return;
  const db = getDb();
  db.prepare(
    'INSERT INTO workflow_vars (workflow_id, execution_id, var_key, var_value) VALUES (?, ?, ?, ?) ON CONFLICT(workflow_id, execution_id, var_key) DO UPDATE SET var_value = ?, updated_at = CURRENT_TIMESTAMP'
  ).run(workflowId || null, executionId || null, key, String(value), String(value));
}

export { cosineSimilarity };
export default { executeWorkflow, topologicalSort, buildNodeInput, cosineSimilarity };
