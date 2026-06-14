import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Trash2, Plus, User, Loader2, Paperclip, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { aiChat, getBuiltinStatus, saveWorkflow, listWorkflows, loadWorkflow, createModel, deleteModel, createApiKey, deleteApiKey, createKnowledgeBase, deleteKnowledgeBase, indexKnowledgeBase, runWorkflow, createExecutionSocket } from "../api/api";
import { useI18n } from "../i18n";

export default function AIChat() {
  const { t } = useI18n();
  const { chatMessages, addChatMessage, clearChat, nodes, edges, addNode, updateNodeData, clearCanvas, models } = useStore();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [chatTitle, setChatTitle] = useState(t('chat.title'));
  const [builtinReady, setBuiltinReady] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
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
    const textExts = ['.txt','.md','.json','.js','.jsx','.ts','.tsx','.py','.html','.css','.csv','.xml','.yaml','.yml','.log','.sh','.env','.cfg','.ini','.toml','.sql','.java','.c','.cpp','.h','.go','.rs','.rb','.php'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const isText = textExts.includes(ext) || file.type.startsWith('text/') || file.type === 'application/json';

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
            case "connect": useStore.getState()._pushUndo(); useStore.getState().onConnect({ source: action.payload.source, target: action.payload.target }); addChatMessage({ role: "system", content: "✅ 已连接" }); break;
            case "connect_with_mapping": useStore.getState()._pushUndo(); useStore.getState().onConnect({ source: action.payload.source, target: action.payload.target }); addChatMessage({ role: "system", content: `✅ 已连接，字段映射: ${JSON.stringify(action.payload.mapping)}` }); break;
            case "connect_with_condition": useStore.getState()._pushUndo(); useStore.getState().onConnect({ source: action.payload.source, target: action.payload.target }); addChatMessage({ role: "system", content: `✅ 已连接，条件: ${action.payload.condition}` }); break;
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
                  ws.onmessage = (e) => {
                    const msg = JSON.parse(e.data);
                    if (msg.type === "log") s.addExecutionLog(msg.data);
                    else if (msg.type === "complete") { s.setExecutionStatus("completed"); s.addExecutionLog({ level: "info", message: "执行完成" }); }
                    else if (msg.type === "error") { s.setExecutionStatus("failed"); s.addExecutionLog({ level: "error", message: msg.error }); }
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
                    wf.nodes.forEach((n) => useStore.getState().addNode(n.type, n.data, n.position));
                    useStore.setState({ edges: wf.edges || [] });
                    addChatMessage({ role: "system", content: `✅ 已加载: ${wf.name}` });
                  }
                } catch (err) {
                  addChatMessage({ role: "system", content: `❌ 加载失败: ${err.message}` });
                }
              })();
              break;
            case "list_workflows":
              (async () => {
                try {
                  const wfs = await listWorkflows();
                  const names = wfs.map((w) => `#${w.id} ${w.name}`).join("\n");
                  addChatMessage({ role: "assistant", content: names || "暂无已保存的工作流" });
                } catch (err) {
                  addChatMessage({ role: "system", content: `❌ 查询失败: ${err.message}` });
                }
              })();
              break;
            case "export_workflow":
              const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "workflow.json"; a.click();
              URL.revokeObjectURL(url);
              addChatMessage({ role: "system", content: "✅ 工作流已导出" });
              break;
            case "add_model":
              createModel(action.payload)
                .then(() => addChatMessage({ role: "system", content: "✅ 模型已添加" }))
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
        }
      }
    }
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return; // silently ignore aborted requests
      const errMsg = err.response?.data?.error || err.message || 'Unknown error';
      addChatMessage({ role: "assistant", content: t('chat.requestFailed') + errMsg });
      toast.error(errMsg);
    } finally { setLoading(false); }
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
        <button onClick={() => { clearChat(); addChatMessage({ role: "assistant", content: t('chat.greeting') }); }}
          className="w-6 h-6 flex items-center justify-center rounded-md text-surface-500 hover:text-surface-300 transition-colors" title={t('chat.newChat')}>
          <Plus size={12} />
        </button>
        <button onClick={clearChat} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-500 hover:text-surface-300 transition-colors" title={t('chat.clear')}>
          <Trash2 size={11} />
        </button>
      </div>

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


