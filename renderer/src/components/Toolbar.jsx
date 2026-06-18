import { Play, Save, Download, FolderOpen, Undo2, Redo2, Trash2, FilePlus, GripHorizontal, LayoutTemplate } from "lucide-react";
import { useRef, useEffect, useCallback, useState } from "react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { saveWorkflow, runWorkflow, createExecutionSocket } from "../api/api";
import { useI18n } from "../i18n";
import SaveModal from "./SaveModal";
import LoadModal from "./LoadModal";
import TemplateModal from "./TemplateModal";

export default function Toolbar() {
  const store = useStore();
  const { t } = useI18n();
  const wsRef = useRef(null);

  // Modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const handleRun = useCallback(async () => {
    const s = useStore.getState();
    if (s.nodes.length === 0) return toast.error(t('toolbar.emptyCanvas'));
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    s.setRunLogOpen(true);
    s.addExecutionLog({ level: "info", message: "⏳ 正在连接后端..." });
    const toastId = toast.loading(t('toolbar.running'));
    try {
      const { execution_id } = await runWorkflow({ nodes: s.nodes, edges: s.edges, options: { outputDir: s.outputDir || undefined } });
      s.setExecutionId(execution_id);
      s.addExecutionToHistory(execution_id);
      toast.dismiss(toastId);
      toast.success(t('toolbar.started'));
      const ws = createExecutionSocket(execution_id);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "log") {
          s.addExecutionLog(msg.data);
          const logMsg = msg.data.message || '';
          const nodeState = useStore.getState().nodeExecutionState;
          const nodes = useStore.getState().nodes;
          // Match: ✓ NodeName 执行完成
          const doneMatch = logMsg.match(/✓\s+(.+?)\s+执行完成/);
          if (doneMatch) {
            const label = doneMatch[1].trim();
            const node = nodes.find(n => (n.data?.label || n.id) === label);
            if (node) useStore.getState().updateNodeExecution(node.id, 'completed');
          }
          // Match: ✗ NodeName 失败
          const failMatch = logMsg.match(/✗\s+(.+?)\s+失败/);
          if (failMatch) {
            const label = failMatch[1].trim();
            const node = nodes.find(n => (n.data?.label || n.id) === label);
            if (node) useStore.getState().updateNodeExecution(node.id, 'failed');
          }
          // Match: ⊘ NodeName 已跳过
          const skipMatch = logMsg.match(/⊘\s+(.+?)\s+已跳过/);
          if (skipMatch) {
            const label = skipMatch[1].trim();
            const node = nodes.find(n => (n.data?.label || n.id) === label);
            if (node) useStore.getState().updateNodeExecution(node.id, 'skipped');
          }
          // Match: Subprocess entry
          const subMatch = logMsg.match(/📦\s+进入子流程/);
          if (subMatch) {
            // Find workflow nodes and mark as running
            const wfNodes = nodes.filter(n => n.type === 'workflow');
            for (const wn of wfNodes) useStore.getState().updateNodeExecution(wn.id, 'running');
          }
          const subDone = logMsg.match(/📦\s+子流程.*完成/);
          if (subDone) {
            const wfNodes = nodes.filter(n => n.type === 'workflow' && nodeState[n.id] === 'running');
            for (const wn of wfNodes) useStore.getState().updateNodeExecution(wn.id, 'completed');
          }
        }
        else if (msg.type === "complete") {
          s.setExecutionStatus("completed");
          s.addExecutionLog({ level: "info", message: t('runLog.done') });
          // Save per-node results for structured visualization
          if (msg.result?.results) {
            s.setExecutionResults(msg.result.results);
          }
          wsRef.current = null;
          toast.success('工作流执行完成', { icon: '✅', duration: 4000 });
        }
        else if (msg.type === "error") { s.setExecutionStatus("failed"); s.addExecutionLog({ level: "error", message: msg.error }); wsRef.current = null; toast.error('工作流执行失败', { icon: '❌', duration: 5000 }); if ('Notification' in window && Notification.permission === 'granted') { new Notification('Local Canvas - 执行失败', { body: msg.error?.substring(0, 120) || '工作流执行未完成', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23ef4444"/><text x="50" y="68" text-anchor="middle" font-size="55" font-weight="bold" fill="white">✗</text></svg>' }); } }
        else if (msg.type === "step_pause") {
          s.addExecutionLog({ level: "info", message: `⏸ 暂停于节点: ${msg.data?.label || msg.data?.id}` });
          if (msg.data?.id) {
            const node = nodes.find(n => n.id === msg.data.id);
            if (node) useStore.getState().updateNodeExecution(msg.data.id, 'running');
          }
        }
      };
      ws.onerror = () => { wsRef.current = null; };
      ws.onclose = () => { wsRef.current = null; };
    } catch (err) {
      s.setExecutionStatus("failed");
      toast.dismiss(toastId);
      s.addExecutionLog({ level: "error", message: err?.response?.data?.error || err.message || "Failed to start" });
      toast.error(t('toolbar.runFailed'));
    }
  }, [t]);

  const handleSave = useCallback(async (name) => {
    setShowSaveModal(false);
    const s = useStore.getState();
    try {
      const result = await saveWorkflow(name, s.nodes, s.edges, s.currentWorkflowId);
      s.setCurrentWorkflowId(result.id);
      s.setCurrentWorkflowName(name);
      s.setDirty(false);
      toast.success(t('toolbar.saved'));
    } catch (err) {
      toast.error(`Save failed: ${err?.response?.data?.error || err.message || 'Unknown error'}`);
    }
  }, [t]);

  const handleLoad = useCallback(() => {
    setShowLoadModal(true);
  }, []);

  const handleNew = useCallback(() => {
    if (useStore.getState().nodes.length > 0) {
      if (!confirm(t('toolbar.confirmNew'))) return;
    }
    useStore.getState().clearCanvas();
    useStore.getState().setCurrentWorkflowName("Untitled");
    useStore.getState().setCurrentWorkflowId(null);
    toast.success(t('toolbar.newCreated'));
  }, [t]);

  const handleExport = useCallback(() => {
    const s = useStore.getState();
    const json = JSON.stringify({ nodes: s.nodes, edges: s.edges, name: s.currentWorkflowName }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (s.currentWorkflowName || "workflow") + ".json"; a.click();
    URL.revokeObjectURL(url);
    toast.success(t('toolbar.exported'));
  }, [t]);

  // Keyboard shortcuts — use getState to avoid stale closures
  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') { e.preventDefault(); setShowSaveModal(true); }
      if (ctrl && e.key === 'e') { e.preventDefault(); handleExport(); }
      if (ctrl && e.key === 'o') { e.preventDefault(); handleLoad(); }
      if (ctrl && e.key === 'z') { e.preventDefault(); useStore.getState().undo(); }
      if (ctrl && e.key === 'y') { e.preventDefault(); useStore.getState().redo(); }
      if (ctrl && e.key === 'n') { e.preventDefault(); handleNew(); }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [handleLoad, handleNew, handleExport]);

  // Request desktop notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleClear = () => {
    if (!confirm(t('toolbar.confirmClear'))) return;
    useStore.getState().clearCanvas();
    toast.success(t('toolbar.cleared'));
  };

  const { undo, redo, undoStack, redoStack } = store;

  return (
    <div className="h-10 bg-surface-850 border-b border-surface-700/40 flex items-center px-2 gap-0 shrink-0">
      <div className="flex items-center gap-1.5 text-xs text-surface-400 min-w-0">
        <GripHorizontal size={12} className="text-surface-600 shrink-0" />
        <span className="font-medium text-surface-300 truncate max-w-[200px]">{store.currentWorkflowName || t('toolbar.workflowName')}</span>
        {store.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="有未保存的更改" />}
      </div>
      <div className="flex-1" />

      <div className="flex items-center gap-0">
        <TB icon={FilePlus} label={t('toolbar.newHint')} onClick={handleNew} />
        <TB icon={LayoutTemplate} label="模板" onClick={() => setShowTemplateModal(true)} />
        <TB icon={FolderOpen} label={t('toolbar.loadHint')} onClick={handleLoad} />
        <TB icon={Save} label={t('toolbar.saveHint')} onClick={() => setShowSaveModal(true)} />
        <TB icon={Download} label={t('toolbar.exportHint')} onClick={handleExport} />
      </div>
      <div className="w-px h-4 bg-surface-700/40 mx-0.5" />
      <div className="flex items-center gap-0">
        <TB icon={Undo2} label={t('toolbar.undoHint')} onClick={undo} disabled={undoStack.length === 0} />
        <TB icon={Redo2} label={t('toolbar.redoHint')} onClick={redo} disabled={redoStack.length === 0} />
        <TB icon={Trash2} label={t('toolbar.clearHint')} onClick={handleClear} />
      </div>
      <div className="w-px h-4 bg-surface-700/40 mx-0.5" />
      <div className="flex items-center gap-0">
        <button onClick={handleRun} className="h-7 px-2.5 ml-1 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm shadow-accent-700/20">
          <Play size={11} />{t('toolbar.run')}
        </button>
      </div>

      {showSaveModal && <SaveModal onSave={handleSave} onClose={() => setShowSaveModal(false)} />}
      {showLoadModal && <LoadModal onClose={() => setShowLoadModal(false)} />}
      {showTemplateModal && <TemplateModal onClose={() => setShowTemplateModal(false)} />}
    </div>
  );
}

function TB({ icon: Icon, label, onClick, disabled }) {
  return (
    <button onClick={() => { if (!disabled) onClick(); }} disabled={disabled}
      className="h-7 w-7 flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-700/40 disabled:text-surface-700 disabled:hover:bg-transparent transition-colors"
      title={label}><Icon size={14} /></button>
  );
}
