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
  { type: 'function', function: { name: 'add_node', description: 'Add a new node to the canvas', parameters: { type: 'object', properties: { skill_id: { type: 'string', description: 'Skill ID' }, node_type: { type: 'string', enum: ['skill', 'knowledge', 'output', 'file_output'], description: 'Node type' }, position_x: { type: 'number', description: 'X coordinate' }, position_y: { type: 'number', description: 'Y coordinate' }, label: { type: 'string', description: 'Node label (optional)' } }, required: ['skill_id', 'position_x', 'position_y'] } } },
  { type: 'function', function: { name: 'connect', description: 'Connect two nodes (data flows from source to target)', parameters: { type: 'object', properties: { source_node_id: { type: 'string', description: 'Source node ID' }, target_node_id: { type: 'string', description: 'Target node ID' } }, required: ['source_node_id', 'target_node_id'] } } },
  { type: 'function', function: { name: 'connect_with_mapping', description: 'Connect with field mapping, specifying which source field maps to which target field', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, mapping: { type: 'object', description: 'Field mapping, e.g. { "targetField": "sourceField" }, supports dot-notation nested paths' } }, required: ['source_node_id', 'target_node_id', 'mapping'] } } },
  { type: 'function', function: { name: 'connect_with_condition', description: 'Connect with a condition — data flows only when the condition is met', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, condition: { type: 'string', description: 'Condition expression, e.g. "output.score > 0.5"' } }, required: ['source_node_id', 'target_node_id', 'condition'] } } },
  { type: 'function', function: { name: 'connect_workflow', description: 'Connect a dragged-in workflow node, embedding one workflow into the current canvas', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, workflow_id: { type: 'number', description: 'Workflow ID to embed' } }, required: ['source_node_id', 'target_node_id', 'workflow_id'] } } },
  { type: 'function', function: { name: 'update_config', description: 'Update node configuration (prompt, parameters, model binding, etc.)', parameters: { type: 'object', properties: { node_id: { type: 'string' }, config_object: { type: 'object', description: 'Configuration key-value pairs' } }, required: ['node_id', 'config_object'] } } },
  { type: 'function', function: { name: 'run_workflow', description: 'Execute the workflow on the current canvas', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'clear_canvas', description: 'Clear all nodes and connections from the canvas', parameters: { type: 'object', properties: {} } } },

  // Workflow management
  { type: 'function', function: { name: 'load_workflow', description: 'Load a saved workflow onto the canvas', parameters: { type: 'object', properties: { workflow_id: { type: 'number', description: 'Workflow ID' }, workflow_name: { type: 'string', description: 'Workflow name (optional)' } }, required: ['workflow_id'] } } },
  { type: 'function', function: { name: 'export_workflow', description: 'Export the current canvas as a JSON file', parameters: { type: 'object', properties: {} } } },

  // Model management
  { type: 'function', function: { name: 'list_models', description: 'List all configured AI models', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'add_model', description: 'Add a new AI model configuration', parameters: { type: 'object', properties: { name: { type: 'string' }, adapter_type: { type: 'string', enum: ['openai', 'ollama', 'anthropic'] }, endpoint: { type: 'string', description: 'API endpoint URL' }, model: { type: 'string', description: 'Model ID' }, api_key: { type: 'string', description: 'API key' } }, required: ['name', 'adapter_type', 'endpoint', 'model'] } } },

  // API Key
  { type: 'function', function: { name: 'add_api_key', description: 'Save an API key', parameters: { type: 'object', properties: { name: { type: 'string' }, api_key: { type: 'string' } }, required: ['name', 'api_key'] } } },

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
- 一次调用一个工具，等结果再决定下一步`
    : `You are the AI assistant for Local Canvas, a visual AI workflow builder.

You can operate the canvas, manage models and knowledge bases, and read/write local files.

Rules:
- For greetings and simple questions, respond directly in English without calling tools
- Only call tools when the user explicitly asks for an action
- Call one tool at a time, wait for the result before deciding the next step`;
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
  // 1. Build the messages array
  const messages = [
    { role: 'system', content: buildSystemPrompt(lang || 'zh') },
    ...history.slice(-20), // keep last 20 history entries
    {
      role: 'user',
      content: `Current canvas state:\nNodes: ${JSON.stringify(canvasState.nodes?.map(n => ({ id: n.id, type: n.type, label: n.data?.label, skillId: n.data?.skillId })) || [])}\nEdges: ${JSON.stringify(canvasState.edges?.map(e => ({ source: e.source, target: e.target })) || [])}\n\nUser message: ${message}`,
    },
  ];

  // 2. Call the model with tools
  const response = await adapter.chat(messages, {
    temperature: 0.5,
    max_tokens: 2048,
    tools: CANVAS_TOOLS,
    tool_choice: 'auto',
    timeout: 180000,
  });

  // 3. Parse the response
  const reply = response.content || '';
  const toolCalls = response.tool_calls || [];

  // 4. Separate tool calls: frontend-executable vs backend-internal
  const actions = [];
  const toolResults = [];

  for (const tc of toolCalls) {
    const name = tc.function?.name;
    const args = parseToolArgs(tc);

    if (name === 'read_file' || name === 'list_files' || name === 'search_files') {
      // Backend executes file operations
      try {
        let result;
        if (name === 'read_file') {
          if (!isSafePath(args.file_path)) throw new Error('Access denied: path is outside allowed directories');
          const content = fs.readFileSync(args.file_path, 'utf8');
          result = { file: args.file_path, content: content.slice(0, 10000) };
          if (content.length > 10000) result.truncated = true;
        } else if (name === 'list_files') {
          if (!isSafePath(args.dir_path)) throw new Error('Access denied: path is outside allowed directories');
          const entries = fs.readdirSync(args.dir_path, { withFileTypes: true });
          result = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'folder' : 'file',
          }));
        } else if (name === 'search_files') {
          const dir = args.dir_path || os.homedir();
          if (!isSafePath(dir)) throw new Error('Access denied: path is outside allowed directories');
          result = searchFilesSync(dir, args.pattern, 2); // depth 2
        }
        toolResults.push({ id: tc.id, name, status: 'ok', result, truncated: !!result?.truncated });
      } catch (err) {
        toolResults.push({ id: tc.id, name, status: 'error', error: err.message });
      }
    } else {
      // Frontend-executable tools, convert to actions
      const action = parseAction(name, args);
      if (action) actions.push(action);
    }
  }

  // 5. If there are backend execution results, feed them back to the model for final reply
  if (toolResults.length > 0) {
    const continuation = [...messages];
    continuation.push({ role: 'assistant', content: reply, tool_calls: toolCalls });

    for (const tr of toolResults) {
      let resultStr = tr.status === 'ok'
        ? JSON.stringify(tr.result)
        : `error: ${tr.error}`;
      // 如果结果被截断，告知模型
      if (tr.truncated) resultStr += '\n[Note: output was truncated to 10000 characters]';
      const content = tr.status === 'ok'
        ? `Tool "${tr.name}" result: ${resultStr}`
        : `Tool "${tr.name}" failed: ${tr.error}`;
      continuation.push({ role: 'tool', content, tool_call_id: tr.id });
    }

    continuation.push({ role: 'user', content: 'Please respond to the user based on the above results.' });

    const finalResponse = await adapter.chat(continuation, {
      temperature: 0.5,
      max_tokens: 2048,
      timeout: 180000,
    });
    return { reply: finalResponse.content || reply, actions };
  }

  return { reply, actions };
}

/**
 * Path safety check: prevent access to system directories and hidden files.
 */
const FORBIDDEN_PREFIXES = [
  '/etc', '/bin', '/usr', '/sys', '/proc', '/dev', '/boot',
  'C:\\Windows', 'C:\\Windows\\System32',
];

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
  // Block hidden files/dirs (except . and ..)
  const segments = resolved.split(path.sep);
  for (const seg of segments) {
    if (seg.startsWith('.') && seg !== '.' && seg !== '..') return false;
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
      payload: { name: args.name, adapter_type: args.adapter_type, config: { endpoint: args.endpoint, apiKey: args.api_key, model: args.model } },
    }),
    add_api_key: () => ({ type: 'add_api_key', payload: { name: args.name, api_key: args.api_key } }),
    add_knowledge_base: () => ({ type: 'add_knowledge_base', payload: { name: args.name, folder_path: args.folder_path } }),
    index_knowledge_base: () => ({ type: 'index_knowledge_base', payload: { kb_id: args.kb_id, model_id: args.model_id } }),
    navigate_to_settings: () => ({ type: 'navigate_to_settings', payload: {} }),
  };
  const fn = actionMap[name];
  return fn ? fn() : null;
}

export default { handleChatMessage };
