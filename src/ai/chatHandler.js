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
  { type: 'function', function: { name: 'add_node', description: 'Add a new node to the canvas. For model nodes, set node_type="model" and pass model_id in config. For skill nodes, set node_type="skill" and pass skill_id.', parameters: { type: 'object', properties: { node_type: { type: 'string', enum: ['input','model','code','output','file_output','condition','api_caller','knowledge','skill'], description: 'Node type' }, label: { type: 'string', description: 'Display label for the node (Chinese recommended)' }, config: { type: 'object', description: 'Node config — for model: {prompt,model_id,temperature,max_tokens}; for code: {code,sandbox:"vm"}; for file_output: {format,fileName}; for input: {input: data}; for condition: {expression}' }, position_x: { type: 'number', description: 'X coordinate (recommend spacing 250 between nodes)' }, position_y: { type: 'number', description: 'Y coordinate (same row = same Y)' } }, required: ['node_type', 'label'] } } },
  { type: 'function', function: { name: 'connect', description: 'Connect two nodes by label (data flows source→target). Use the exact labels you gave when adding nodes.', parameters: { type: 'object', properties: { source_label: { type: 'string', description: 'Source node label exactly as added' }, target_label: { type: 'string', description: 'Target node label exactly as added' } }, required: ['source_label', 'target_label'] } } },
  { type: 'function', function: { name: 'connect_with_mapping', description: 'Connect with field mapping by label, specifying which source field maps to which target field', parameters: { type: 'object', properties: { source_label: { type: 'string' }, target_label: { type: 'string' }, mapping: { type: 'object', description: 'Field mapping, e.g. { "targetField": "sourceField" }, supports dot-notation nested paths' } }, required: ['source_label', 'target_label', 'mapping'] } } },
  { type: 'function', function: { name: 'connect_with_condition', description: 'Connect with a condition by label — data flows only when the condition is met', parameters: { type: 'object', properties: { source_label: { type: 'string' }, target_label: { type: 'string' }, condition: { type: 'string', description: 'Condition expression, e.g. "output.score > 0.5"' } }, required: ['source_label', 'target_label', 'condition'] } } },
  { type: 'function', function: { name: 'connect_workflow', description: 'Connect a workflow node by label, embedding one workflow into the current canvas', parameters: { type: 'object', properties: { source_label: { type: 'string' }, target_label: { type: 'string' }, workflow_id: { type: 'number', description: 'Workflow ID to embed' } }, required: ['source_label', 'target_label', 'workflow_id'] } } },
  { type: 'function', function: { name: 'update_config', description: 'Update node configuration (prompt, parameters, model binding, etc.)', parameters: { type: 'object', properties: { node_id: { type: 'string' }, config_object: { type: 'object', description: 'Configuration key-value pairs' } }, required: ['node_id', 'config_object'] } } },
  { type: 'function', function: { name: 'run_workflow', description: 'Execute the workflow on the current canvas', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'clear_canvas', description: 'Clear all nodes and connections from the canvas', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'undo', description: 'Undo the last canvas operation (add/remove/move/connect). Use this when you made a mistake.', parameters: { type: 'object', properties: {} } } },

  // Incremental modifications (for "改一下第3步" style edits)
  { type: 'function', function: { name: 'delete_node', description: 'Delete a specific node from the canvas', parameters: { type: 'object', properties: { node_label: { type: 'string', description: 'Label or ID of the node to delete' } }, required: ['node_label'] } } },
  { type: 'function', function: { name: 'rename_node', description: 'Rename a specific node on the canvas (find by label or index)', parameters: { type: 'object', properties: { node_label: { type: 'string', description: 'Current label of the node to rename (fuzzy match supported)' }, new_label: { type: 'string', description: 'New label for the node' } }, required: ['node_label', 'new_label'] } } },
  { type: 'function', function: { name: 'move_node', description: 'Move a node to a different position', parameters: { type: 'object', properties: { node_label: { type: 'string', description: 'Label of the node to move' }, position_x: { type: 'number' }, position_y: { type: 'number' } }, required: ['node_label', 'position_x', 'position_y'] } } },
  { type: 'function', function: { name: 'delete_edge', description: 'Delete a connection (edge) between two nodes', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' } }, required: ['source_node_id', 'target_node_id'] } } },
  { type: 'function', function: { name: 'insert_node_between', description: 'Insert a new node between two connected nodes', parameters: { type: 'object', properties: { source_node_id: { type: 'string' }, target_node_id: { type: 'string' }, node_type: { type: 'string', enum: ['model', 'code', 'condition', 'api_caller'] }, label: { type: 'string' } }, required: ['source_node_id', 'target_node_id', 'node_type'] } } },
  { type: 'function', function: { name: 'change_node_type', description: 'Change the type of a node (e.g. model→code)', parameters: { type: 'object', properties: { node_label: { type: 'string' }, new_type: { type: 'string', enum: ['model', 'code', 'condition', 'input', 'output', 'api_caller'] } }, required: ['node_label', 'new_type'] } } },
  { type: 'function', function: { name: 'get_node_config', description: 'Read the full configuration of a specific node (find by label or ID). Use before modifying a node to see current settings.', parameters: { type: 'object', properties: { node_label: { type: 'string', description: 'Label or ID of the node to inspect' } }, required: ['node_label'] } } },

  // Workflow management
  { type: 'function', function: { name: 'save_workflow', description: 'Save the current canvas as a named workflow', parameters: { type: 'object', properties: { name: { type: 'string', description: 'Workflow name' } }, required: ['name'] } } },
  { type: 'function', function: { name: 'load_workflow', description: 'Load a saved workflow onto the canvas', parameters: { type: 'object', properties: { workflow_id: { type: 'number', description: 'Workflow ID' }, workflow_name: { type: 'string', description: 'Workflow name (optional)' } }, required: ['workflow_id'] } } },
  { type: 'function', function: { name: 'list_workflows', description: 'List all saved workflows', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'export_workflow', description: 'Export the current canvas as a JSON file', parameters: { type: 'object', properties: {} } } },

  // Model management
  { type: 'function', function: { name: 'list_models', description: 'List all configured AI models', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'add_model', description: 'Add a new AI model configuration (API key must be entered separately in Settings for security)', parameters: { type: 'object', properties: { name: { type: 'string' }, adapter_type: { type: 'string', enum: ['openai', 'ollama', 'anthropic'] }, endpoint: { type: 'string', description: 'API endpoint URL' }, model: { type: 'string', description: 'Model ID' } }, required: ['name', 'adapter_type', 'endpoint', 'model'] } } },

  // Resource queries
  { type: 'function', function: { name: 'list_skills', description: 'List all available skills that can be used in skill nodes', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_knowledge_bases', description: 'List all configured knowledge bases', parameters: { type: 'object', properties: {} } } },

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
 * Build a summary of available resources for the AI to reference.
 */
function buildResourceContext(db, userId) {
  try {
    const models = db.prepare('SELECT id, name, adapter_type FROM models WHERE user_id = ? AND is_active = 1').all(userId);
    const skills = db.prepare('SELECT id, name FROM skills WHERE user_id = ?').all(userId);
    const kbs = db.prepare('SELECT id, name FROM knowledge_bases WHERE user_id = ?').all(userId);

    let ctx = `资源摘要: ${models.length} 个可用模型, ${skills.length} 个技能, ${kbs.length} 个知识库。`;
    if (models.length > 0) {
      ctx += `\n模型列表: ${models.map(m => `#${m.id} ${m.name}(${m.adapter_type})`).join(' | ')}。`;
      ctx += `\n⚠️ 添加模型节点时，config.model_id 必须用上述模型 ID（数字）。`;
    }
    ctx += '\n可用模板(告诉用户可直接加载): 快速体验/翻译工作流/文本摘要/代码生成。';
    return ctx;
  } catch {
    return '';
  }
}

/**
 * System prompt for the AI assistant.
 */
function buildSystemPrompt(lang) {
  const isCN = lang === 'zh';
  return isCN
    ? `你是 Local Canvas 的可视化 AI 工作流构建助手。

你可以操作画布（添加/连接/删除/修改节点）、管理模型和知识库、读写本地文件、搜索文件。
节点类型：input(输入节点/存放原始数据)、model(LLM模型/翻译/摘要/对话)、code(Javascript代码/数据处理)、output(输出节点/显示结果)、file_output(文件输出/保存为json/csv/html/md/txt)、condition(条件分支)、api_caller(调用API)、knowledge(知识库检索)、skill(技能节点)。

## 核心规则
- 用户说"搭/建/做/创建 + 工作流名称" → **立刻同时调用 add_node 和 connect**，在同一轮里完成全部节点+连线。不要先解释再行动，不要分两轮
- add_node 用 node_type/label/config 三个参数；节点加完后立刻用 connect(source_label, target_label) 连线
- 空画布搭新工作流时绝不先查资源——资源摘要已在下文给出
- 简单问候("你好"/"谢谢")直接回复文字，不调工具
- 操作失败时自查恢复（检查名称/ID，或 list 类工具确认状态）

## 节点搭建示例（严格按此模式操作）
用户说"翻译工作流" → 同时调用:
1. add_node(node_type="input", label="原文", config={input:"你好，世界"})
2. add_node(node_type="model", label="翻译", config={model_id:可用模型ID, prompt:"把以下内容翻译成英文: {{input}}", temperature:0.3})
3. add_node(node_type="output", label="译文")
4. connect(source_label="原文", target_label="翻译")
5. connect(source_label="翻译", target_label="译文")`
    : `You are the Local Canvas visual AI workflow builder assistant.

You can manipulate the canvas (add/connect/delete/modify nodes), manage models/knowledge bases, read/write/search files.
Node types: input, model(LLM), code(JavaScript), output, file_output(json/csv/html/md/txt), condition, api_caller, knowledge, skill.

## Core Rules
- User says "build/create/make + workflow" → IMMEDIATELY call add_node and connect, no pre-check, no explanation
- On empty canvas: add all nodes and edges in one go. Don't "let me check resources first" — resource summary is already below
- Only use get_node_config when modifying existing nodes
- Simple greetings reply directly, no tools

## Patterns
Translation: input → model(prompt="Translate to English: {{input}}") → output
Summarize: input → model(prompt="Summarize:\\n\\n{{input}}") → output
Code gen: input → model(prompt="Generate code:\\n\\n{{input}}") → file_output(format="txt")
General: input → [processing nodes...] → output/file_output`;
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
  const isSimpleMessage = /^(你好|hi|hello|hey|谢谢|thanks|ok|好的|嗯|哦|是的|yes|no|hi,|hello,|helo)\b/i.test(message.trim()) && message.trim().length < 30;

  // 1. Build resource awareness context (skip for simple messages to save latency)
  const availableResources = isSimpleMessage ? '' : buildResourceContext(db, userId);

  // 2. Build the base messages array — skip canvas state for simple messages
  const messages = [
    { role: 'system', content: buildSystemPrompt(lang || 'zh') },
    ...history.slice(-10),
    {
      role: 'user',
      content: isSimpleMessage
        ? `User message: ${message}`
        : `${availableResources ? availableResources + '\n\n' : ''}Current canvas state:\nNodes: ${JSON.stringify(canvasState.nodes?.map(n => {
        const cfg = n.data?.config || {};
        const truncatedCfg = {};
        for (const [k, v] of Object.entries(cfg)) {
          truncatedCfg[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '...(truncated)' : v;
        }
        return {
          id: n.id, type: n.type, label: n.data?.label,
          modelId: n.data?.modelId, config: truncatedCfg,
          code: n.data?.code ? n.data.code.slice(0, 200) + (n.data.code.length > 200 ? '...(truncated)' : '') : undefined,
        };
      }) || [])}\nEdges: ${JSON.stringify(canvasState.edges?.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label, mapping: e.data?.mapping })) || [])}\n\nUser message: ${message}`,
    },
  ];

  // 2. Multi-step ReAct loop: iterate until no tool calls or max rounds
  const allActions = [];
  let finalReply = '';
  const MAX_ROUNDS = 2;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await adapter.chat(messages, {
      temperature: 0.3,
      max_tokens: 1024,
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

      if (name === 'read_file' || name === 'list_files' || name === 'search_files' || name === 'get_node_config'
          || name === 'list_skills' || name === 'list_models' || name === 'list_knowledge_bases' || name === 'list_workflows') {
        backendTasks.push({ tc, name, args });
      } else {
        const action = parseAction(name, args);
        if (action) {
          action._tcId = tc.id; // preserve model's tool_call id for result matching
          roundActions.push(action);
        }
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
          } else if (name === 'list_skills') {
            const rows = db.prepare('SELECT id, name, description FROM skills WHERE user_id = ?').all(userId);
            result = rows.map(r => ({ id: r.id, name: r.name, desc: (r.description || '').slice(0, 60) }));
          } else if (name === 'list_models') {
            const rows = db.prepare('SELECT id, name, adapter_type FROM models WHERE user_id = ?').all(userId);
            result = rows.map(r => ({ id: r.id, name: r.name, type: r.adapter_type }));
          } else if (name === 'list_knowledge_bases') {
            const rows = db.prepare('SELECT id, name, folder_path FROM knowledge_bases WHERE user_id = ?').all(userId);
            result = rows.map(r => ({ id: r.id, name: r.name, path: r.folder_path }));
          } else if (name === 'list_workflows') {
            const rows = db.prepare('SELECT id, name FROM workflows WHERE user_id = ?').all(userId);
            result = rows.map(r => ({ id: r.id, name: r.name }));
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

    // Build synthetic tool results for frontend actions so the model knows they executed
    for (const a of roundActions) {
      toolResults.push({
        id: a._tcId || `frontend_${a.type}_${round}_${Date.now()}`,
        name: a.type,
        status: 'ok',
        result: { executed: true, type: a.type, payload: a.payload },
      });
    }

    // Feed tool results back for next round (includes both backend + frontend)
    messages.push({ role: 'assistant', content: reply, tool_calls: toolCalls });

    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        let resultStr = tr.status === 'ok' ? JSON.stringify(tr.result) : `error: ${tr.error}`;
        if (tr.truncated) resultStr += '\n[Note: output was truncated]';
        const toolMsg = tr.status === 'ok'
          ? `Tool "${tr.name}" result: ${resultStr}`
          : `Tool "${tr.name}" failed: ${tr.error}`;
        messages.push({ role: 'tool', content: toolMsg, tool_call_id: tr.id });
      }
      messages.push({ role: 'user', content: 'Continue based on the tool results. If done, reply without tools.' });
    }

    finalReply = reply;
  }

  // If no reply generated, provide a fallback
  if (!finalReply && allActions.length > 0) {
    finalReply = `已完成 ${allActions.length} 项操作。`;
  } else if (!finalReply) {
    finalReply = '我理解了，但我不知道如何操作。请更具体地描述你的需求。';
  }

  // Auto-connect: if nodes were added but no connections made, chain them in order
  const addNodes = allActions.filter(a => a.type === 'add_node');
  const hasConnections = allActions.some(a => a.type === 'connect' || a.type === 'connect_with_mapping' || a.type === 'connect_with_condition');
  if (addNodes.length >= 2 && !hasConnections) {
    for (let i = 0; i < addNodes.length - 1; i++) {
      const src = addNodes[i].payload.data?.label || addNodes[i].payload.nodeType;
      const tgt = addNodes[i + 1].payload.data?.label || addNodes[i + 1].payload.nodeType;
      if (src && tgt) {
        allActions.push({ type: 'connect', payload: { source_label: src, target_label: tgt } });
      }
    }
    finalReply = (finalReply || '') + `\n✅ 已自动连接 ${addNodes.length - 1} 条连线。`;
  }

  return { reply: finalReply, actions: allActions };
}

/**
 * Path safety check: prevent access to system directories and hidden files.
 */
const FORBIDDEN_PREFIXES = [
  '/etc', '/bin', '/usr', '/sys', '/proc', '/dev', '/boot', '/root', '/var/log',
  'C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files', 'C:\\Program Files (x86)',
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
        nodeType: args.node_type || 'model',
        data: { label: args.label || '', config: args.config || {} },
        position: args.position_x != null ? { x: args.position_x, y: args.position_y } : undefined,
      },
    }),
    connect: () => ({
      type: 'connect',
      payload: { source_label: args.source_label, target_label: args.target_label },
    }),
    connect_with_mapping: () => ({
      type: 'connect_with_mapping',
      payload: { source_label: args.source_label, target_label: args.target_label, mapping: args.mapping },
    }),
    connect_with_condition: () => ({
      type: 'connect_with_condition',
      payload: { source_label: args.source_label, target_label: args.target_label, condition: args.condition },
    }),
    connect_workflow: () => ({
      type: 'connect_workflow',
      payload: { source_label: args.source_label, target_label: args.target_label, workflow_id: args.workflow_id },
    }),
    update_config: () => ({
      type: 'update_config',
      payload: { nodeId: args.node_id, config: args.config_object },
    }),
    run_workflow: () => ({ type: 'run_workflow', payload: {} }),
    clear_canvas: () => ({ type: 'clear_canvas', payload: {} }),
    undo: () => ({ type: 'undo', payload: {} }),
    save_workflow: () => ({ type: 'save_workflow', payload: { name: args.name } }),
    load_workflow: () => ({
      type: 'load_workflow',
      payload: { workflow_id: args.workflow_id, workflow_name: args.workflow_name },
    }),
    export_workflow: () => ({ type: 'export_workflow', payload: {} }),
    list_workflows: () => ({ type: 'list_workflows', payload: {} }),
    list_models: () => ({ type: 'list_models', payload: {} }),
    list_skills: () => ({ type: 'list_skills', payload: {} }),
    list_knowledge_bases: () => ({ type: 'list_knowledge_bases', payload: {} }),
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
    delete_node: () => ({ type: 'delete_node', payload: { node_label: args.node_label } }),
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
