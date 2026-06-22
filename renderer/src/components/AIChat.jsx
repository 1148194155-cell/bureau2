import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Trash2, Plus, User, Loader2, Paperclip, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { aiChat, getBuiltinStatus, saveWorkflow, listWorkflows, loadWorkflow, createModel, deleteModel, createApiKey, deleteApiKey, createKnowledgeBase, deleteKnowledgeBase, indexKnowledgeBase, runWorkflow, createExecutionSocket } from "../api/api";
import { useI18n } from "../i18n";

/** Format output files into a readable chat message. */
function formatOutputMarkdown(outputFiles, results) {
  if (!outputFiles || outputFiles.length === 0) return null;

  const lines = [];
  const hasAnyOutput = outputFiles.some(f => f.nodeType === 'file_output' && f.content);
  lines.push(hasAnyOutput ? '## 📦 执行完成 · 输出文件\n' : '## ✅ 执行完成\n');

  for (const f of outputFiles) {
    const type = f.nodeType || 'output';
    const label = f.nodeName || type;
    const emoji = type === 'file_output' ? '📄' : type === 'skill' ? '🔧' : type === 'input' ? '📝' : '📋';

    if (type === 'file_output' && f.content) {
      const ext = String(f.content).split('.').pop()?.toLowerCase() || '';
      const fileUrl = `file:///${String(f.content).replace(/\\/g, '/')}`;
      if (['png','jpg','jpeg','gif','svg','webp','bmp'].includes(ext)) {
        lines.push(`### ${emoji} ${label}`);
        lines.push(`![${label}](${fileUrl})`);
        lines.push(`> 🖼️ [打开图片](${fileUrl})  ·  \`${f.content}\`\n`);
      } else if (['mp4','mov','avi','webm','mkv'].includes(ext)) {
        lines.push(`### 🎬 ${label}`);
        lines.push(`> 📂 [打开文件夹](${fileUrl})  ·  \`${f.content}\`\n`);
      } else if (['pdf','docx','pptx','xlsx'].includes(ext)) {
        lines.push(`### 📑 ${label}`);
        lines.push(`> 📂 [打开文档](${fileUrl})  ·  \`${f.content}\`\n`);
      } else {
        lines.push(`### ${emoji} ${label}`);
        lines.push(`> 📂 [打开文件](${fileUrl})  ·  \`${f.content}\`\n`);
      }
    } else if (f.content && typeof f.content === 'string' && f.content.length > 0) {
      lines.push(`### ${emoji} ${label}`);
      const trimmed = f.content.length > 600 ? f.content.slice(0, 600) + '\n... (已截断)' : f.content;
      lines.push('```');
      if (f.content.startsWith('{') || f.content.startsWith('[')) lines.push(trimmed);
      else lines.push(trimmed);
      lines.push('```\n');
    }
  }

  const allOk = !results || results.every(r => r.success || r.optionalFailed);
  lines.push(allOk ? '✅ 全部节点执行完毕' : '⚠️ 部分节点失败，查看执行日志了解详情');
  return lines.join('\n');
}

/** Find nodes by label (case-insensitive, trimmed) and connect them. */
function connectByLabel(srcLabel, tgtLabel, mapping, condition) {
  const { nodes, edges, onConnect, setEdgeData, _pushUndo } = useStore.getState();
  const find = (lbl) => {
    const clean = lbl.trim().toLowerCase();
    return nodes.find(n => (n.data?.label || '').trim().toLowerCase() === clean)?.id;
  };
  const src = find(srcLabel);
  const tgt = find(tgtLabel);
  if (!src || !tgt) {
    toast.error(`无法连线: 未找到节点 "${!src ? srcLabel : tgtLabel}"`);
    return;
  }
  _pushUndo();
  const prevEdges = useStore.getState().edges;
  onConnect({ source: src, target: tgt });
  if (mapping) {
    // Find the newly created edge (last in list) and set its mapping
    const newEdges = useStore.getState().edges;
    const newEdge = newEdges.find(e => e.source === src && e.target === tgt && !prevEdges.includes(e));
    if (newEdge) {
      setEdgeData(newEdge.id, { mapping });
    }
  }
}

export default function AIChat() {
  const { t } = useI18n();
  const { chatMessages, addChatMessage, clearChat, nodes, edges, addNode, updateNodeData, clearCanvas, models } = useStore();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const loadingTimeoutRef = useRef(null);
  const loadingSinceRef = useRef(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModelForm, setNewModelForm] = useState({
    name: '', adapter_type: 'openai', endpoint: '', apiKey: '', model: ''
  });
  const [addingModel, setAddingModel] = useState(false);
  const [chatTitle, setChatTitle] = useState(t('chat.title'));
  const [builtinReady, setBuiltinReady] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const wsRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, loading]);

  useEffect(() => {
    getBuiltinStatus().then(info => {
      if (info?.available) {
        setBuiltinReady(true);
        const builtin = useStore.getState().models.find(m => m.id === 'builtin');
        if (builtin) setSelectedModel('builtin');
      }
    }).catch(() => {});
  }, []);

  const FILE_EXTENSIONS = ['.txt','.md','.json','.js','.jsx','.ts','.tsx','.py','.html','.css','.csv','.xml','.yaml','.yml','.log','.sh','.env','.cfg','.ini','.toml','.sql','.java','.c','.cpp','.h','.go','.rs','.rb','.php'];

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（>10MB 拒绝）
    if (file.size > 10 * 1024 * 1024) {
      toast.error('文件过大（最大 10MB）');
      e.target.value = '';
      return;
    }

    // 检查是否文本文件
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const isText = FILE_EXTENSIONS.includes(ext) || file.type.startsWith('text/') || file.type === 'application/json';

    if (!isText) {
      toast.error(`不支持的文件类型: ${ext}。仅支持文本文件。`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      const truncated = content.length > 5000
        ? content.slice(0, 5000) + '\n... (内容已截断)'
        : content;
      setInput(`文件 ${file.name} 的内容：\n\`\`\`\n${truncated}\n\`\`\``);
    };
    reader.onerror = () => {
      toast.error(`文件读取失败: ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const cleanupLoading = () => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    loadingSinceRef.current = null;
    setLoading(false);
    setStreamingText('');
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    addChatMessage({ role: "user", content: msg });
    setInput("");
    setLoading(true);
    try {
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
      const result = await aiChat({ message: msg, history, canvas_state: { nodes, edges }, model_id: selectedModel || undefined, lang: 'zh' }, controller.signal);
      addChatMessage({ role: "assistant", content: result.reply });
      if (result.actions) {
        for (const action of result.actions) {
          switch (action.type) {
            case "add_node": addNode(action.payload.nodeType, { ...action.payload.data, config: action.payload.data?.config || {} }, action.payload.position); addChatMessage({ role: "system", content: t('chat.nodeAdded') }); break;
            case "connect": useStore.getState()._pushUndo(); connectByLabel(action.payload.source_label, action.payload.target_label); addChatMessage({ role: "system", content: "✅ 已连接" }); break;
            case "connect_with_mapping": useStore.getState()._pushUndo(); connectByLabel(action.payload.source_label, action.payload.target_label, action.payload.mapping); addChatMessage({ role: "system", content: `✅ 已连接，字段映射: ${JSON.stringify(action.payload.mapping)}` }); break;
            case "connect_with_condition": useStore.getState()._pushUndo(); connectByLabel(action.payload.source_label, action.payload.target_label, null, action.payload.condition); addChatMessage({ role: "system", content: `✅ 已连接，条件: ${action.payload.condition}` }); break;
            case "connect_workflow": useStore.getState()._pushUndo(); useStore.getState().onConnect({ source: action.payload.source, target: action.payload.target }); addChatMessage({ role: "system", content: "✅ 工作流节点已连接" }); break;
            case "update_config": updateNodeData(action.payload.nodeId, { config: action.payload.config }); addChatMessage({ role: "system", content: t('chat.configUpdated') }); break;
            case "run_workflow":
              (async () => {
                const s = useStore.getState();
                if (s.nodes.length === 0) { addChatMessage({ role: "system", content: "⚠️ 画布为空，无法执行" }); return; }
                try {
                  const { execution_id } = await runWorkflow({ nodes: s.nodes, edges: s.edges, options: { outputDir: s.outputDir || undefined } });
                  s.setExecutionId(execution_id);
                  s.setRunLogOpen(true);
                  const ws = createExecutionSocket(execution_id);
                  if (wsRef.current) { try { wsRef.current.close(); } catch {} }
                  wsRef.current = ws;
                  let wsDisconnectTimer = null;
                  ws.onmessage = (e) => {
                    const msg = JSON.parse(e.data);
                    if (msg.type === "log") s.addExecutionLog(msg.data);
                    else if (msg.type === "complete") {
                      clearTimeout(wsDisconnectTimer);
                      s.setExecutionStatus("completed");
                      s.addExecutionLog({ level: "info", message: "执行完成" });
                      // Show output files in chat
                      const outputFiles = msg.result?.outputFiles || [];
                      const results = msg.result?.results || [];
                      const md = formatOutputMarkdown(outputFiles, results);
                      if (md) addChatMessage({ role: "assistant", content: md });
                      // Auto-trigger AI report
                      setTimeout(() => {
                        const st = useStore.getState();
                        if (st.chatMessages.length > 0) {
                          const lastMsg = st.chatMessages[st.chatMessages.length - 1];
                          if (lastMsg.role === 'assistant' && lastMsg.content.includes('输出文件')) {
                            st.addChatMessage({ role: "assistant", content: "📊 **AI 报告生成**\n\n点击 `生成报告` 按钮，或直接输入 \"生成执行报告\" 让我为你总结这次执行的结果。", _reportPrompt: true });
                          }
                        }
                      }, 500);
                    }
                    else if (msg.type === "error") { clearTimeout(wsDisconnectTimer); s.setExecutionStatus("failed"); s.addExecutionLog({ level: "error", message: msg.error }); addChatMessage({ role: "system", content: `❌ 执行失败: ${msg.error}` }); }
                  };
                  ws.onerror = (e) => {
                    s.addExecutionLog({ level: "error", message: "WebSocket connection error" });
                  };
                  ws.onclose = () => {
                    const state = useStore.getState();
                    if (state.executionStatus === "running") {
                      wsDisconnectTimer = setTimeout(() => {
                        const currentState = useStore.getState();
                        if (currentState.executionStatus === "running") {
                          currentState.setExecutionStatus("failed");
                          currentState.addExecutionLog({ level: "error", message: "连接断开，执行超时" });
                          addChatMessage({ role: "system", content: "WebSocket 连接超时断开" });
                        }
                      }, 30000);
                    }
                  };
                  addChatMessage({ role: "system", content: t('chat.aiTriggered') });
                } catch (err) {
                  addChatMessage({ role: "system", content: `❌ 执行失败: ${err.message}` });
                }
              })();
              break;
            case "clear_canvas": clearCanvas(); addChatMessage({ role: "system", content: t('chat.cleared') }); break;
            case "save_workflow":
              saveWorkflow(action.payload.name, nodes, edges, null)
                .then(() => addChatMessage({ role: "system", content: "✅ 工作流已保存" }))
                .catch(() => addChatMessage({ role: "system", content: "❌ 保存失败" }));
              break;
            case "load_workflow":
              (async () => {
                try {
                  const wf = await loadWorkflow(action.payload.workflow_id);
                  if (wf) {
                    useStore.getState().clearCanvas();
                    wf.nodes.forEach((n) => useStore.getState().addNode(n.type, { ...n.data, nodeId: undefined }, n.position));
                    // Use loadCanvas to sync edgeData from loaded edges
                    const st = useStore.getState();
                    const nodeList = st.nodes;
                    const idMap = {};
                    const now = Date.now();
                    const edgesWithIds = (wf.edges || []).map((e, i) => {
                      const newId = `wf_e_${i}_${now}`;
                      return { ...e, id: newId };
                    });
                    st.loadCanvas(nodeList, edgesWithIds);
                    addChatMessage({ role: "system", content: `✅ 已加载: ${wf.name}` });
                  }
                } catch (err) {
                  addChatMessage({ role: "system", content: `❌ 加载失败: ${err.message}` });
                }
              })();
              break;
            case "list_workflows":
              // Now handled as backend task — results fed to AI model
              addChatMessage({ role: "system", content: "🔍 查询工作流列表..." });
              break;
            case "export_workflow":
              const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "workflow.json"; a.click();
              URL.revokeObjectURL(url);
              addChatMessage({ role: "system", content: "✅ 工作流已导出" });
              break;
            case "list_models":
              addChatMessage({ role: "system", content: "..." });
              break;
            case "list_skills":
              addChatMessage({ role: "system", content: "..." });
              break;
            case "list_knowledge_bases":
              addChatMessage({ role: "system", content: "..." });
              break;
            case "undo":
              useStore.getState().undo();
              addChatMessage({ role: "system", content: "Undone" });
              break;
            case "delete_node":
              {
                const s = useStore.getState();
                const node = s.nodes.find(n => n.id === action.payload.node_label || (n.data?.label || '').includes(action.payload.node_label));
                if (node) {
                  s._pushUndo();
                  s.removeNode(node.id);
                  addChatMessage({ role: "system", content: `Deleted "${node.data?.label || node.id}"` });
                } else {
                  addChatMessage({ role: "system", content: `Node not found: "${action.payload.node_label}"` });
                }
              }
              break;
            case "add_model":
              createModel(action.payload)
                .then(() => {
                  const note = action.note || '';
                  addChatMessage({ role: "system", content: `✅ 模型已添加${note ? '。' + note : ''}` });
                })
                .catch((err) => addChatMessage({ role: "system", content: `❌ 添加失败: ${err.message}` }));
              break;
            case "delete_model":
              deleteModel(action.payload.model_id)
                .then(() => addChatMessage({ role: "system", content: "✅ 模型已删除" }))
                .catch((err) => addChatMessage({ role: "system", content: `❌ 删除失败: ${err.message}` }));
              break;
            case "add_api_key":
              createApiKey(action.payload)
                .then(() => addChatMessage({ role: "system", content: "✅ API Key 已保存" }))
                .catch((err) => addChatMessage({ role: "system", content: `❌ 保存失败: ${err.message}` }));
              break;
            case "delete_api_key":
              deleteApiKey(action.payload.key_id)
                .then(() => addChatMessage({ role: "system", content: "✅ API Key 已删除" }))
                .catch((err) => addChatMessage({ role: "system", content: `❌ 删除失败: ${err.message}` }));
              break;
            case "add_knowledge_base":
              createKnowledgeBase(action.payload)
                .then(() => addChatMessage({ role: "system", content: "✅ 知识库已添加" }))
                .catch((err) => addChatMessage({ role: "system", content: `❌ 添加失败: ${err.message}` }));
              break;
            case "delete_knowledge_base":
              deleteKnowledgeBase(action.payload.kb_id)
                .then(() => addChatMessage({ role: "system", content: "✅ 知识库已删除" }))
                .catch((err) => addChatMessage({ role: "system", content: `❌ 删除失败: ${err.message}` }));
              break;
            case "index_knowledge_base":
              indexKnowledgeBase(action.payload.kb_id, action.payload.model_id)
                .then(() => addChatMessage({ role: "system", content: "✅ 索引已触发" }))
                .catch((err) => addChatMessage({ role: "system", content: `❌ 索引失败: ${err.message}` }));
              break;
            case "navigate_to_settings":
              useStore.getState().setNavigateToPage("settings");
              addChatMessage({ role: "system", content: "正在切换到设置页面" });
              break;
            case "rename_node":
              {
                const s = useStore.getState();
                const node = s.nodes.find(n => (n.data?.label || '').includes(action.payload.node_label));
                if (node) {
                  s.updateNodeData(node.id, { ...node.data, label: action.payload.new_label });
                  addChatMessage({ role: "system", content: `✅ 节点已重命名为 "${action.payload.new_label}"` });
                } else {
                  addChatMessage({ role: "system", content: `❌ 未找到节点 "${action.payload.node_label}"` });
                }
              }
              break;
            case "move_node":
              {
                const s = useStore.getState();
                const node = s.nodes.find(n => (n.data?.label || '').includes(action.payload.node_label));
                if (node && action.payload.position) {
                  s.onNodesChange([{ id: node.id, type: 'position', position: action.payload.position }]);
                  addChatMessage({ role: "system", content: `✅ 节点 "${action.payload.node_label}" 已移动` });
                }
              }
              break;
            case "delete_edge":
              {
                const s = useStore.getState();
                const edge = s.edges.find(e => e.source === action.payload.source && e.target === action.payload.target);
                if (edge) {
                  s.onEdgesChange([{ id: edge.id, type: 'remove' }]);
                  addChatMessage({ role: "system", content: "✅ 连线已删除" });
                } else {
                  addChatMessage({ role: "system", content: "❌ 未找到对应连线" });
                }
              }
              break;
            case "insert_node_between":
              {
                const s = useStore.getState();
                const edge = s.edges.find(e => e.source === action.payload.source && e.target === action.payload.target);
                if (!edge) { addChatMessage({ role: "system", content: "❌ 未找到要插入位置的两个节点之间的连线" }); break; }
                // Calculate midpoint position
                const srcNode = s.nodes.find(n => n.id === edge.source);
                const tgtNode = s.nodes.find(n => n.id === edge.target);
                const midX = srcNode && tgtNode ? (srcNode.position.x + tgtNode.position.x) / 2 : 400;
                const midY = srcNode && tgtNode ? (srcNode.position.y + tgtNode.position.y) / 2 : 200;
                const newId = `ai_ins_${Date.now()}`;
                s.addNode(action.payload.node_type, { label: action.payload.label || action.payload.node_type, config: {} }, { x: midX, y: midY });
                // Wait for React state, then reconnect
                setTimeout(() => {
                  const st = useStore.getState();
                  const inserted = st.nodes.find(n => n.id === newId || st.nodes[st.nodes.length - 1]);
                  if (inserted) {
                    st.onEdgesChange([{ id: edge.id, type: 'remove' }]);
                    st.onConnect({ source: edge.source, target: inserted.id, id: `ai_e1_${Date.now()}` });
                    st.onConnect({ source: inserted.id, target: edge.target, id: `ai_e2_${Date.now()}` });
                  }
                }, 200);
                addChatMessage({ role: "system", content: `✅ 已在节点间插入 "${action.payload.label || action.payload.node_type}" 节点` });
              }
              break;
            case "change_node_type":
              {
                const s = useStore.getState();
                const node = s.nodes.find(n => (n.data?.label || '').includes(action.payload.node_label));
                if (node) {
                  s.updateNodeData(node.id, { ...node.data, type: action.payload.new_type });
                  addChatMessage({ role: "system", content: `✅ 节点类型已改为 "${action.payload.new_type}"` });
                }
              }
              break;
        }
      }
    }
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return; // silently ignore aborted requests
      const errMsg = err.response?.data?.error || err.message || 'Unknown error';
      addChatMessage({ role: "assistant", content: t('chat.requestFailed') + errMsg });
      toast.error(errMsg);
    } finally { cleanupLoading(); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="h-full flex flex-col bg-surface-850">
      <div className="h-10 shrink-0 border-b border-surface-700/40 flex items-center px-3 gap-1.5">
        <div className="w-6 h-6 rounded-lg bg-accent-500/10 flex items-center justify-center">
          <Sparkles size={12} className="text-accent-400" />
        </div>
        <input value={chatTitle} onChange={(e) => setChatTitle(e.target.value)}
          className="flex-1 bg-transparent text-xs font-medium text-surface-200 outline-none border-none" />
        <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
          className="h-6 px-1.5 rounded-md bg-surface-800 border border-surface-600 text-[10px] text-surface-300 outline-none">
          <option value="">{t('chat.defaultModel')}</option>
          {models.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
        </select>
        <button onClick={() => setShowAddModel(!showAddModel)}
          className="w-5 h-5 flex items-center justify-center rounded-md text-surface-500 hover:text-accent-400 hover:bg-accent-500/10 transition-colors"
          title="添加模型"
        >
          {showAddModel ? '×' : '+'}
        </button>
        <button onClick={() => { clearChat(); addChatMessage({ role: "assistant", content: t('chat.greeting') }); }}
          className="w-6 h-6 flex items-center justify-center rounded-md text-surface-500 hover:text-surface-300 transition-colors" title={t('chat.newChat')}>
          <Plus size={12} />
        </button>
        <button onClick={clearChat} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-500 hover:text-surface-300 transition-colors" title={t('chat.clear')}>
          <Trash2 size={11} />
        </button>
      </div>

      {showAddModel && (
        <div className="px-3 py-2 border-b border-surface-700/40 bg-surface-800/50 space-y-1.5">
          <div className="flex items-center gap-2">
            <select value={newModelForm.adapter_type} onChange={e => { const type = e.target.value; const presets = { openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o' }, ollama: { endpoint: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }, anthropic: { endpoint: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' } }; setNewModelForm({ ...newModelForm, adapter_type: type, endpoint: presets[type]?.endpoint || '', model: presets[type]?.model || '' }); }}
              className="h-6 px-1 rounded bg-surface-700 border border-surface-600 text-[10px] text-surface-300">
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <input value={newModelForm.endpoint} onChange={e => setNewModelForm({ ...newModelForm, endpoint: e.target.value })} placeholder="API 端点" className="flex-1 h-6 px-2 rounded bg-surface-700 border border-surface-600 text-[10px] text-surface-200 placeholder-surface-600" />
            <input value={newModelForm.model} onChange={e => setNewModelForm({ ...newModelForm, model: e.target.value })} placeholder="模型 ID" className="w-28 h-6 px-2 rounded bg-surface-700 border border-surface-600 text-[10px] text-surface-200 placeholder-surface-600" />
          </div>
          <div className="flex items-center gap-2">
            <input type="password" value={newModelForm.apiKey} onChange={e => setNewModelForm({ ...newModelForm, apiKey: e.target.value })} placeholder="API Key (sk-...)" className="flex-1 h-6 px-2 rounded bg-surface-700 border border-surface-600 text-[10px] text-surface-200 placeholder-surface-600" />
            <button
              onClick={async () => {
                const f = newModelForm;
                if (!f.endpoint || !f.model) return toast.error('端点地址和模型 ID 必填');
                setAddingModel(true);
                try {
                  const result = await createModel({
                    name: f.model,
                    adapter_type: f.adapter_type,
                    config: { endpoint: f.endpoint, apiKey: f.apiKey, model: f.model }
                  });
                  const { fetchModels } = await import('../api/api');
                  const modelsList = await fetchModels();
                  useStore.getState().setModels(modelsList);
                  setSelectedModel(result.id);
                  setShowAddModel(false);
                  setNewModelForm({ name: '', adapter_type: 'openai', endpoint: '', apiKey: '', model: '' });
                  toast.success('模型已添加并选中');
                } catch (err) {
                  toast.error(err.message || '添加失败');
                } finally { setAddingModel(false); }
              }}
              disabled={addingModel}
              className="h-6 px-3 rounded bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 text-surface-950 text-[10px] font-medium shrink-0"
            >
              {addingModel ? '...' : '保存'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2.5">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-surface-500 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent-500/10 flex items-center justify-center">
              <Sparkles size={20} className="text-accent-400" />
            </div>
            <div className="text-center">
              <div className="text-xs font-medium text-surface-400 mb-1">{t('chat.greeting')}</div>
              <div className="text-[10px] text-surface-600">{t('chat.subtitle')}</div>
            </div>
            <div className="flex flex-wrap gap-1 justify-center mt-1">
              {(() => {
                const s = useStore.getState();
                const hints = [];
                if (s.models.length > 1) hints.push('帮我搭一个翻译工作流');
                if (s.models.length > 0) hints.push('用 AI 帮我写一段代码');
                if (s.knowledgeBases?.length > 0) hints.push('从这个知识库里搜索相关内容');
                hints.push('清空画布', '帮我连线节点');
                return hints.map(hint => (
                  <button key={hint} onClick={() => setInput(hint)}
                    className="px-2 py-1 rounded-lg bg-surface-700/40 hover:bg-surface-700 border border-surface-600/30 text-[10px] text-surface-400 hover:text-surface-200 transition-colors">
                    {hint}
                  </button>
                ));
              })()}
            </div>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <div key={i} className={"flex gap-2 " + (msg.role === "user" ? "justify-end" : "justify-start") + " animate-float-up"}>
            {msg.role !== "user" && msg.role !== "system" && (
              <div className="w-6 h-6 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={11} className="text-accent-400" />
              </div>
            )}
            <div className={"max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed " + (
              msg.role === "user" ? "bg-accent-600 text-surface-950 rounded-br-md" :
              msg.role === "system" ? "bg-surface-700/50 text-surface-400 text-[10px] italic rounded-xl text-center w-full max-w-full" :
              "bg-surface-800/80 border border-surface-600/30 text-surface-200 rounded-bl-md"
            )}>
              {msg.role === "system" ? msg.content : (
                <ReactMarkdown
                  className="prose prose-sm prose-invert max-w-none [&_p]:my-0.5 [&_code]:bg-surface-700 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px] [&_pre]:bg-surface-950 [&_pre]:p-2 [&_pre]:rounded-xl [&_pre]:text-[10px]"
                  components={{ a: ({ href, children }) => (<a href={href} target="_blank" rel="noopener" className="text-accent-300 underline">{children}</a>) }}>
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-6 h-6 rounded-lg bg-surface-700 flex items-center justify-center shrink-0 mt-0.5">
                <User size={11} className="text-surface-400" />
              </div>
            )}
            {msg.role === "assistant" && (msg.content.includes('失败') || msg.content.includes('failed') || msg.content.includes('error')) && (() => {
              const userMsgIdx = chatMessages.slice(0, i).findLastIndex(m => m.role === 'user');
              const userMsg = userMsgIdx >= 0 ? chatMessages[userMsgIdx] : null;
              if (!userMsg) return null;
              return (
                <button onClick={() => { setInput(userMsg.content); handleSend(); }}
                  className="mt-1 text-[10px] px-2 py-0.5 rounded-md bg-surface-700/50 text-surface-400 hover:text-surface-200 transition-colors flex items-center gap-1">
                  <RotateCcw size={10} /> 重试
                </button>
              );
            })()}
            {msg.content && msg.content.includes('输出文件') && (() => (
              <button onClick={() => { setInput('生成执行报告'); }}
                className="mt-1 text-[10px] px-2 py-0.5 rounded-md bg-accent-600/20 border border-accent-500/30 text-accent-300 hover:bg-accent-500/30 transition-colors flex items-center gap-1">
                <Sparkles size={10} /> 生成报告
              </button>
            ))()}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 animate-float-up">
            <div className="w-6 h-6 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0"><Sparkles size={11} className="text-accent-400" /></div>
            <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-surface-800/80 border border-surface-600/30">
              <Loader2 size={14} className="text-surface-400 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-2.5 border-t border-surface-700/40 bg-surface-850/90 backdrop-blur-sm">
        <div className="flex gap-1.5">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            rows={1}
            className="flex-1 resize-none h-9 max-h-28 px-3 py-2 rounded-xl bg-surface-800 border border-surface-600/50 text-xs text-surface-200 placeholder-surface-500 focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 outline-none transition-all" />
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 shrink-0 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-400 flex items-center justify-center transition-all active:scale-95">
            <Paperclip size={13} />
          </button>
          <button onClick={handleSend} disabled={!input.trim() || loading}
            className="w-9 h-9 shrink-0 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 disabled:text-surface-500 text-surface-950 flex items-center justify-center transition-all active:scale-95">
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}


