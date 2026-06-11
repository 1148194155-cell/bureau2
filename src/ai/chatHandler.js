import { getDb } from '../db.js';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

/**
 * Tool definitions for the ReAct pattern.
 * These are exposed to the AI model as function/tool definitions.
 */
const CANVAS_TOOLS = [
  // ── 画布操作 ──
  { type: 'function', function: { name: 'add_node', description: '添加一个新节点到画布', parameters: { type: 'object', properties: { skill_id: { type: 'string', description: 'Skill ID' }, position_x: { type: 'number', description: 'X 坐标' }, position_y: { type: 'number', description: 'Y 坐标' }, label: { type: 'string', description: '节点名称（可选）' } }, required: ['skill_id', 'position_x', 'position_y'] } } },
  { type: 'function', function: { name: 'connect', description: '连接两个节点（普通连接，数据从 source 流向 target）', parameters: { type: 'object', properties: { source_node_id: { type: 'string', description: '源节点 ID' }, target_node_id: { type: 'string', description: '目标节点 ID' } }, required: ['source_node_id', 'target_node_id'] } } },
  { type: 'function', function: { name: 'connect_with_mapping', description: '带字段映射的连接，指定 source 的哪个字段输出到 target 的哪个字段', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, mapping: { type: 'object', description: '字段映射，如 { "targetField": "sourceField" }，支持点号嵌套路径' } }, required: ['source_node_id', 'target_node_id', 'mapping'] } } },
  { type: 'function', function: { name: 'connect_with_condition', description: '带条件的连接，满足条件时才传递数据', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, condition: { type: 'string', description: '条件表达式，如 "output.score > 0.5"' } }, required: ['source_node_id', 'target_node_id', 'condition'] } } },
  { type: 'function', function: { name: 'connect_workflow', description: '连接用户拖入的工作流节点，将一个工作流嵌入到当前画布中', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, workflow_id: { type: 'number', description: '要嵌入的工作流 ID' } }, required: ['source_node_id', 'target_node_id', 'workflow_id'] } } },
  { type: 'function', function: { name: 'update_config', description: '修改节点配置（prompt、参数、模型绑定等）', parameters: { type: 'object', properties: { node_id: { type: 'string' }, config_object: { type: 'object', description: '配置键值对' } }, required: ['node_id', 'config_object'] } } },
  { type: 'function', function: { name: 'run_workflow', description: '执行当前画布上的工作流', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'clear_canvas', description: '清空画布上所有节点和连线', parameters: { type: 'object', properties: {} } } },

  // ── 工作流管理 ──
  { type: 'function', function: { name: 'load_workflow', description: '加载一个已保存的工作流到画布', parameters: { type: 'object', properties: { workflow_id: { type: 'number', description: '工作流 ID' }, workflow_name: { type: 'string', description: '工作流名称（可选）' } }, required: ['workflow_id'] } } },
  { type: 'function', function: { name: 'export_workflow', description: '导出当前画布为 JSON 文件', parameters: { type: 'object', properties: {} } } },

  // ── 模型管理 ──
  { type: 'function', function: { name: 'list_models', description: '列出所有已配置的 AI 模型', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'add_model', description: '添加一个新的 AI 模型配置', parameters: { type: 'object', properties: { name: { type: 'string' }, adapter_type: { type: 'string', enum: ['openai', 'ollama', 'anthropic'] }, endpoint: { type: 'string', description: 'API 地址' }, model: { type: 'string', description: '模型 ID' }, api_key: { type: 'string', description: 'API Key' } }, required: ['name', 'adapter_type', 'endpoint', 'model'] } } },

  // ── API Key ──
  { type: 'function', function: { name: 'add_api_key', description: '保存一个 API Key', parameters: { type: 'object', properties: { name: { type: 'string' }, api_key: { type: 'string' } }, required: ['name', 'api_key'] } } },

  // ── 知识库 ──
  { type: 'function', function: { name: 'add_knowledge_base', description: '添加一个知识库', parameters: { type: 'object', properties: { name: { type: 'string' }, folder_path: { type: 'string', description: '文档文件夹路径' } }, required: ['name', 'folder_path'] } } },
  { type: 'function', function: { name: 'index_knowledge_base', description: '触发知识库索引重建', parameters: { type: 'object', properties: { kb_id: { type: 'number' }, model_id: { type: 'number', description: '用于嵌入的模型 ID（可选）' } }, required: ['kb_id'] } } },

  // ── 文件操作 ──
  { type: 'function', function: { name: 'read_file', description: '读取本地文件的内容（仅限文本文件）', parameters: { type: 'object', properties: { file_path: { type: 'string', description: '文件完整路径' } }, required: ['file_path'] } } },
  { type: 'function', function: { name: 'list_files', description: '列出指定目录下的文件和文件夹', parameters: { type: 'object', properties: { dir_path: { type: 'string', description: '目录路径' } }, required: ['dir_path'] } } },
  { type: 'function', function: { name: 'search_files', description: '按文件名搜索文件', parameters: { type: 'object', properties: { pattern: { type: 'string', description: '文件名关键词' }, dir_path: { type: 'string', description: '搜索目录（可选，默认用户目录）' } }, required: ['pattern'] } } },

  // ── 页面导航 ──
  { type: 'function', function: { name: 'navigate_to_settings', description: '切换到设置页面，用于管理模型、API Key、知识库等', parameters: { type: 'object', properties: {} } } },
];

/**
 * System prompt for the AI assistant.
 */
function buildSystemPrompt(lang) {
  const isCN = lang === 'zh';
  return isCN
    ? `你是 Local Canvas 的 AI 助手，一个可视化 AI 工作流搭建工具。

你可以操作画布、管理模型和知识库、读写本地文件。

规则：
- 打招呼和简单提问，直接中文回复，不要调用工具
- 只有用户明确要求操作时才调用工具
- 每次只调用一个工具，等待结果后再决定下一步`
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
      content: `Current canvas state:\nNodes: ${JSON.stringify(canvasState.nodes, null, 2)}\nEdges: ${JSON.stringify(canvasState.edges, null, 2)}\n\nUser message: ${message}`,
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

  // 4. 分离工具调用：前端可执行 vs 后端内部执行
  const actions = [];
  const toolResults = [];

  for (const tc of toolCalls) {
    const name = tc.function?.name;
    const args = parseToolArgs(tc);

    if (name === 'read_file' || name === 'list_files' || name === 'search_files') {
      // 后端执行文件操作
      try {
        let result;
        if (name === 'read_file') {
          const content = fs.readFileSync(args.file_path, 'utf8');
          result = { file: args.file_path, content: content.slice(0, 10000) };
          if (content.length > 10000) result.truncated = true;
        } else if (name === 'list_files') {
          const entries = fs.readdirSync(args.dir_path, { withFileTypes: true });
          result = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'folder' : 'file',
          }));
        } else if (name === 'search_files') {
          const dir = args.dir_path || os.homedir();
          result = searchFilesSync(dir, args.pattern, 2); // 深度2
        }
        toolResults.push({ name, status: 'ok', result });
      } catch (err) {
        toolResults.push({ name, status: 'error', error: err.message });
      }
    } else {
      // 前端可执行的工具，转成 action
      const action = parseAction(name, args);
      if (action) actions.push(action);
    }
  }

  // 5. 如果有后端执行结果，喂回模型做最终回复
  if (toolResults.length > 0) {
    const continuation = [...messages];
    continuation.push({ role: 'assistant', content: reply });

    for (const tr of toolResults) {
      const content = tr.status === 'ok'
        ? `工具 "${tr.name}" 执行成功，结果：${JSON.stringify(tr.result)}`
        : `工具 "${tr.name}" 执行失败：${tr.error}`;
      continuation.push({ role: 'tool', content, tool_call_id: tr.name });
    }

    continuation.push({ role: 'user', content: '请根据以上结果回复用户。' });

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
 * 递归搜索文件（限制深度防止跑太久）
 */
function searchFilesSync(dir, pattern, maxDepth, _depth = 0) {
  if (_depth > maxDepth) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results = [];
    for (const e of entries) {
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
 * 将工具调用转为前端 action
 */
function parseAction(name, args) {
  const actionMap = {
    add_node: () => ({
      type: 'add_node',
      payload: {
        nodeType: 'skill',
        data: { label: args.label || '', skillId: args.skill_id },
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
