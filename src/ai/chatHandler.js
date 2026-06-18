import { getDb } from '../db.js';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

/**
 * Tool definitions for the ReAct pattern.
 * These are exposed to the AI model as function/tool definitions.
 */
const CANVAS_TOOLS = [
  // Canvas operations
  { type: 'function', function: { name: 'add_node', description: 'Add a new node to the canvas', parameters: { type: 'object', properties: { skill_id: { type: 'string', description: 'Skill ID' }, node_type: { type: 'string', enum: ['skill', 'knowledge', 'output', 'file_output', 'model', 'input', 'code', 'api_caller', 'condition'], description: 'Node type' }, position_x: { type: 'number', description: 'X coordinate' }, position_y: { type: 'number', description: 'Y coordinate' }, label: { type: 'string', description: 'Node label (optional)' } }, required: ['skill_id', 'position_x', 'position_y'] } } },
  { type: 'function', function: { name: 'connect', description: 'Connect two nodes (data flows from source to target)', parameters: { type: 'object', properties: { source_node_id: { type: 'string', description: 'Source node ID' }, target_node_id: { type: 'string', description: 'Target node ID' } }, required: ['source_node_id', 'target_node_id'] } } },
  { type: 'function', function: { name: 'connect_with_mapping', description: 'Connect with field mapping, specifying which source field maps to which target field', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, mapping: { type: 'object', description: 'Field mapping, e.g. { "targetField": "sourceField" }, supports dot-notation nested paths' } }, required: ['source_node_id', 'target_node_id', 'mapping'] } } },
  { type: 'function', function: { name: 'connect_with_condition', description: 'Connect with a condition — data flows only when the condition is met', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, condition: { type: 'string', description: 'Condition expression, e.g. "output.score > 0.5"' } }, required: ['source_node_id', 'target_node_id', 'condition'] } } },
  { type: 'function', function: { name: 'connect_workflow', description: 'Connect a dragged-in workflow node, embedding one workflow into the current canvas', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, workflow_id: { type: 'number', description: 'Workflow ID to embed' } }, required: ['source_node_id', 'target_node_id', 'workflow_id'] } } },
  { type: 'function', function: { name: 'update_config', description: 'Update node configuration (prompt, parameters, model binding, etc.)', parameters: { type: 'object', properties: { node_id: { type: 'string' }, config_object: { type: 'object', description: 'Configuration key-value pairs' } }, required: ['node_id', 'config_object'] } } },
  { type: 'function', function: { name: 'run_workflow', description: 'Execute the workflow on the current canvas', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'clear_canvas', description: 'Clear all nodes and connections from the canvas', parameters: { type: 'object', properties: {} } } },

  // Incremental modifications (for "改一下第3步" style edits)
  { type: 'function', function: { name: 'rename_node', description: 'Rename a specific node on the canvas (find by label or index)', parameters: { type: 'object', properties: { node_label: { type: 'string', description: 'Current label of the node to rename (fuzzy match supported)' }, new_label: { type: 'string', description: 'New label for the node' } }, required: ['node_label', 'new_label'] } } },
  { type: 'function', function: { name: 'move_node', description: 'Move a node to a different position', parameters: { type: 'object', properties: { node_label: { type: 'string', description: 'Label of the node to move' }, position_x: { type: 'number' }, position_y: { type: 'number' } }, required: ['node_label', 'position_x', 'position_y'] } } },
  { type: 'function', function: { name: 'delete_edge', description: 'Delete a connection (edge) between two nodes', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' } }, required: ['source_node_id', 'target_node_id'] } } },
  { type: 'function', function: { name: 'insert_node_between', description: 'Insert a new node between two connected nodes', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, node_type: { type: 'string', enum: ['model', 'code', 'condition', 'api_caller'] }, label: { type: 'string' } }, required: ['source_node_id', 'target_node_id', 'node_type'] } } },
  { type: 'function', function: { name: 'change_node_type', description: 'Change the type of a node (e.g. model→code)', parameters: { type: 'object', properties: { node_label: { type: 'string' }, new_type: { type: 'string', enum: ['model', 'code', 'condition', 'input', 'output', 'api_caller'] } }, required: ['node_label', 'new_type'] } } },
  { type: 'function', function: { name: 'get_node_config', description: 'Read the full configuration of a specific node (find by label or ID). Use before modifying a node to see current settings.', parameters: { type: 'object', properties: { node_label: { type: 'string', description: 'Label or ID of the node to inspect' } }, required: ['node_label'] } } },

  // Workflow management
  { type: 'function', function: { name: 'load_workflow', description: 'Load a saved workflow onto the canvas', parameters: { type: 'object', properties: { workflow_id: { type: 'number', description: 'Workflow ID' }, workflow_name: { type: 'string', description: 'Workflow name (optional)' } }, required: ['workflow_id'] } } },
  { type: 'function', function: { name: 'export_workflow', description: 'Export the current canvas as a JSON file', parameters: { type: 'object', properties: {} } } },

  // Model management
  { type: 'function', function: { name: 'list_models', description: 'List all configured AI models', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'add_model', description: 'Add a new AI model configuration (API key must be entered separately in Settings for security)', parameters: { type: 'object', properties: { name: { type: 'string' }, adapter_type: { type: 'string', enum: ['openai', 'ollama', 'anthropic'] }, endpoint: { type: 'string', description: 'API endpoint URL' }, model: { type: 'string', description: 'Model ID' } }, required: ['name', 'adapter_type', 'endpoint', 'model'] } } },

  // API Key — 移除: Key 不应经过 AI 模型传输，请在设置页面直接输入以保证安全

  // Knowledge base
  { type: 'function', function: { name: 'add_knowledge_base', description: 'Add a knowledge base', parameters: { type: 'object', properties: { name: { type: 'string' }, folder_path: { type: 'string', description: 'Document folder path' } }, required: ['name', 'folder_path'] } } },
  { type: 'function', function: { name: 'index_knowledge_base', description: 'Trigger knowledge base re-indexing', parameters: { type: 'object', properties: { kb_id: { type: 'number' }, model_id: { type: 'number', description: 'Model ID for embeddings (optional)' } }, required: ['kb_id'] } } },

  // File operations
  { type: 'function', function: { name: 'read_file', description: 'Read the content of a local file (text files only)', parameters: { type: 'object', properties: { file_path: { type: 'string', description: 'Full file path' } }, required: ['file_path'] } } },
  { type: 'function', function: { name: 'list_files', description: 'List files and folders in a directory', parameters: { type: 'object', properties: { dir_path: { type: 'string', description: 'Directory path' } }, required: ['dir_path'] } } },
  { type: 'function', function: { name: 'search_files', description: 'Search for files by name', parameters: { type: 'object', properties: { pattern: { type: 'string', description: 'Filename keyword' }, dir_path: { type: 'string', description: 'Search directory (optional, defaults to user home)' } }, required: ['pattern'] } } },

  // Page navigation
  { type: 'function', function: { name: 'navigate_to_settings', description: 'Navigate to the settings page to manage models, API keys, knowledge bases, etc.', parameters: { type: 'object', properties: {} } } },
];

/**
 * System prompt for the AI assistant.
 */
function buildSystemPrompt(lang) {
  const isCN = lang === 'zh';
  return isCN
    ? `你是 Local Canvas 的 AI 助手，一个可视化 AI 工作流构建工具。

你可以操作画布、管理模型和知识库、读写本地文件。

规则：
- 问候和简单问题直接回复，不要调用工具
- 只在用户明确要求操作时才调用工具
- 复杂操作（如"在步骤2和3之间插入翻译节点"）需要多步操作：先 get_node_config 查看当前状态，再逐步执行
- 修改节点前先用 get_node_config 查看当前配置，再精确修改`
    : `You are the AI assistant for Local Canvas, a visual AI workflow builder.

You can operate the canvas, manage models and knowledge bases, and read/write local files.

Rules:
- For greetings and simple questions, respond directly without tools
- Only call tools when the user explicitly asks for an action
- For complex operations (e.g. "insert a translation node between step 2 and 3"), use multiple steps: first get_node_config to check state, then execute
- Before modifying a node, use get_node_config to see its current config, then apply precise changes`;
}

/**
 * Handle an AI chat message with ReAct-style tool calling.
 *
 * @param {object} params
 * @param {string} params.message - User's message
 * @param {Array} params.history - Previous messages [{role, content}]
 * @param {object} params.canvasState - { nodes, edges }
 * @param {object} params.adapter - A model adapter instance
 * @param {number} params.userId - User ID
 * @param {object} params.db - Database instance
 * @returns {Promise<{reply:string, actions:Array}>}
 */
export async function handleChatMessage({ message, history, canvasState, adapter, userId, db, lang }) {
  // 1. Build the base messages array
  const messages = [
    { role: 'system', content: buildSystemPrompt(lang || 'zh') },
    ...history.slice(-20),
    {
      role: 'user',
      content: `Current canvas state:\nNodes: ${JSON.stringify(canvasState.nodes?.map(n => ({ id: n.id, type: n.type, label: n.data?.label, skillId: n.data?.skillId, modelId: n.data?.modelId, config: n.data?.config, code: n.data?.code })) || [])}\nEdges: ${JSON.stringify(canvasState.edges?.map(e => ({ id: e.id, source: e.source, target: e.target, mapping: e.data?.mapping })) || [])}\n\nUser message: ${message}`,
    },
  ];

  // 2. Multi-step ReAct loop: iterate until no tool calls or max rounds
  const allActions = [];
  let finalReply = '';
  const MAX_ROUNDS = 3;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await adapter.chat(messages, {
      temperature: 0.5,
      max_tokens: 2048,
      tools: CANVAS_TOOLS,
      tool_choice: 'auto',
      timeout: 180000,
    });

    const reply = response.content || '';
    const toolCalls = response.tool_calls || [];

    // If no tool calls, this is the final reply
    if (toolCalls.length === 0) {
      finalReply = reply;
      break;
    }

    // Separate frontend actions from backend tasks
    const roundActions = [];
    const backendTasks = [];

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      const args = parseToolArgs(tc);

      if (name === 'read_file' || name === 'list_files' || name === 'search_files' || name === 'get_node_config') {
        backendTasks.push({ tc, name, args });
      } else {
        const action = parseAction(name, args);
        if (action) roundActions.push(action);
      }
    }

    allActions.push(...roundActions);

    // Execute backend tasks in parallel
    const toolResults = [];
    if (backendTasks.length > 0) {
      const results = await Promise.allSettled(
        backendTasks.map(async ({ tc, name, args }) => {
          let result;
          if (name === 'read_file') {
            if (!isSafePath(args.file_path)) throw new Error('Access denied');
            const content = fs.readFileSync(args.file_path, 'utf8');
            result = { file: args.file_path, content: content.slice(0, 10000) };
            if (content.length > 10000) result.truncated = true;
          } else if (name === 'list_files') {
            if (!isSafePath(args.dir_path)) throw new Error('Access denied');
            const entries = fs.readdirSync(args.dir_path, { withFileTypes: true });
            result = entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'folder' : 'file' }));
          } else if (name === 'search_files') {
            const dir = args.dir_path || os.homedir();
            if (!isSafePath(dir)) throw new Error('Access denied');
            result = searchFilesSync(dir, args.pattern, 2);
          } else if (name === 'get_node_config') {
            const node = findNodeByLabel(canvasState.nodes, args.node_label);
            if (!node) {
              result = { error: `Node "${args.node_label}" not found on canvas` };
            } else {
              result = buildNodeConfigResult(node, canvasState.edges);
            }
          }
          return { id: tc.id, name, status: 'ok', result, truncated: !!result?.truncated };
        })
      );

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const task = backendTasks[i];
        if (r.status === 'fulfilled') {
          toolResults.push(r.value);
        } else {
          toolResults.push({ id: task.tc.id, name: task.name, status: 'error', error: r.reason?.message || 'Unknown error' });
        }
      }
    }

    // If no backend tasks ran, we're done (frontend actions collected)
    if (toolResults.length === 0) {
      finalReply = reply;
      break;
    }

    // Feed tool results back for next round
    messages.push({ role: 'assistant', content: reply, tool_calls: toolCalls });

    for (const tr of toolResults) {
      let resultStr = tr.status === 'ok' ? JSON.stringify(tr.result) : `error: ${tr.error}`;
      if (tr.truncated) resultStr += '\n[Note: output was truncated]';
      const toolMsg = tr.status === 'ok'
        ? `Tool "${tr.name}" result: ${resultStr}`
        : `Tool "${tr.name}" failed: ${tr.error}`;
      messages.push({ role: 'tool', content: toolMsg, tool_call_id: tr.id });
    }

    messages.push({ role: 'user', content: 'Continue based on the tool results. If done, reply without tools.' });

    finalReply = reply;
  }

  // If no reply generated, provide a fallback
  if (!finalReply && allActions.length > 0) {
    finalReply = `已完成 ${allActions.length} 项操作。`;
  } else if (!finalReply) {
    finalReply = '我理解了，但我不知道如何操作。请更具体地描述你的需求。';
  }

  return { reply: finalReply, actions: allActions };
}

/**
 * Path safety check: prevent access to system directories and hidden files.
 */
const FORBIDDEN_PREFIXES = [
  '/etc', '/bin', '/usr', '/sys', '/proc', '/dev', '/boot',
  'C:\\Windows', 'C:\\Windows\\System32',
];

const SENSITIVE_HIDDEN = new Set(['.git', '.ssh', '.gnupg', '.aws', '.azure', '.docker']);

function getAllowedRoots() {
  return [os.homedir(), path.resolve('.')];
}

function isSafePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return false;
  const resolved = path.resolve(inputPath);
  // Block system directories
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (resolved.startsWith(path.resolve(prefix))) return false;
  }
  // Only block known sensitive hidden directories (not all .dotdirs)
  const segments = resolved.split(path.sep);
  for (const seg of segments) {
    if (SENSITIVE_HIDDEN.has(seg)) return false;
  }
  // Block access outside allowed roots (symlink-traversal protection)
  const allowedRoots = getAllowedRoots();
  const isAllowed = allowedRoots.some(root => resolved.startsWith(root));
  return isAllowed;
}

/**
 * Parse tool call arguments (handles both string JSON and already-parsed objects).
 */
function parseToolArgs(tc) {
  const raw = tc.function?.arguments;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
}

/**
 * Recursively search for files (depth-limited to prevent long runs).
 */
function searchFilesSync(dir, pattern, maxDepth, _depth = 0) {
  if (_depth > maxDepth) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results = [];
    // Cap entries per directory to prevent OOM on huge directories
    for (const e of entries.slice(0, 500)) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const fullPath = path.join(dir, e.name);
      if (e.name.toLowerCase().includes(pattern.toLowerCase())) {
        results.push({ name: e.name, path: fullPath, type: e.isDirectory() ? 'folder' : 'file' });
      }
      if (e.isDirectory()) {
        results.push(...searchFilesSync(fullPath, pattern, maxDepth, _depth + 1));
      }
    }
    return results;
  } catch { return []; }
}

/**
 * Convert a tool call into a frontend action.
 */
function parseAction(name, args) {
  const actionMap = {
    add_node: () => ({
      type: 'add_node',
      payload: {
        nodeType: args.node_type || 'skill',
        data: { label: args.label || '', skillId: args.skill_id, description: args.description },
        position: args.position_x != null ? { x: args.position_x, y: args.position_y } : undefined,
      },
    }),
    connect: () => ({
      type: 'connect',
      payload: { source: args.source_node_id, target: args.target_node_id },
    }),
    connect_with_mapping: () => ({
      type: 'connect_with_mapping',
      payload: { source: args.source_node_id, target: args.target_node_id, mapping: args.mapping },
    }),
    connect_with_condition: () => ({
      type: 'connect_with_condition',
      payload: { source: args.source_node_id, target: args.target_node_id, condition: args.condition },
    }),
    connect_workflow: () => ({
      type: 'connect_workflow',
      payload: { source: args.source_node_id, target: args.target_node_id, workflow_id: args.workflow_id },
    }),
    update_config: () => ({
      type: 'update_config',
      payload: { nodeId: args.node_id, config: args.config_object },
    }),
    run_workflow: () => ({ type: 'run_workflow', payload: {} }),
    clear_canvas: () => ({ type: 'clear_canvas', payload: {} }),
    load_workflow: () => ({
      type: 'load_workflow',
      payload: { workflow_id: args.workflow_id, workflow_name: args.workflow_name },
    }),
    export_workflow: () => ({ type: 'export_workflow', payload: {} }),
    list_models: () => ({ type: 'list_models', payload: {} }),
    add_model: () => ({
      type: 'add_model',
      payload: { name: args.name, adapter_type: args.adapter_type, config: { endpoint: args.endpoint, model: args.model } },
      note: '⚠️ API Key 未设置 — 请在设置页面手动填入 Key 以激活模型',
    }),
    // add_api_key removed — API Keys should only be entered in Settings page, never through AI chat
    add_knowledge_base: () => ({ type: 'add_knowledge_base', payload: { name: args.name, folder_path: args.folder_path } }),
    index_knowledge_base: () => ({ type: 'index_knowledge_base', payload: { kb_id: args.kb_id, model_id: args.model_id } }),
    navigate_to_settings: () => ({ type: 'navigate_to_settings', payload: {} }),
    rename_node: () => ({ type: 'rename_node', payload: { node_label: args.node_label, new_label: args.new_label } }),
    move_node: () => ({ type: 'move_node', payload: { node_label: args.node_label, position: { x: args.position_x, y: args.position_y } } }),
    delete_edge: () => ({ type: 'delete_edge', payload: { source: args.source_node_id, target: args.target_node_id } }),
    insert_node_between: () => ({ type: 'insert_node_between', payload: { source: args.source_node_id, target: args.target_node_id, node_type: args.node_type, label: args.label } }),
    change_node_type: () => ({ type: 'change_node_type', payload: { node_label: args.node_label, new_type: args.new_type } }),
  };
  const fn = actionMap[name];
  return fn ? fn() : null;
}

/**
 * Find a node by label (fuzzy match) or by ID.
 */
function findNodeByLabel(nodes, query) {
  if (!nodes?.length || !query) return null;
  // Exact ID match
  const byId = nodes.find(n => n.id === query);
  if (byId) return byId;
  // Exact label match
  const byLabel = nodes.find(n => (n.data?.label || '') === query);
  if (byLabel) return byLabel;
  // Case-insensitive contains match
  const lowerQ = query.toLowerCase();
  const fuzzy = nodes.find(n => (n.data?.label || '').toLowerCase().includes(lowerQ));
  if (fuzzy) return fuzzy;
  return null;
}

/**
 * Build a human-readable summary of a node's configuration.
 */
function buildNodeConfigResult(node, edges) {
  const connectedEdges = edges?.filter(e => e.source === node.id || e.target === node.id) || [];
  const incoming = connectedEdges.filter(e => e.target === node.id).map(e => e.source);
  const outgoing = connectedEdges.filter(e => e.source === node.id).map(e => e.target);

  return {
    id: node.id,
    type: node.type || node.data?.type,
    label: node.data?.label || '',
    config: node.data?.config || {},
    code: node.data?.code || undefined,
    modelId: node.data?.modelId || node.data?.model_id || undefined,
    skillId: node.data?.skillId || node.data?.skill_id || undefined,
    input: node.data?.input || undefined,
    position: node.position,
    connections: {
      incomingFrom: incoming,
      outgoingTo: outgoing,
      edgeCount: connectedEdges.length,
    },
  };
}

export default { handleChatMessage };
