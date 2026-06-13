import { Play, Save, Download, FolderOpen, Undo2, Redo2, Trash2, Timer, GripHorizontal } from "lucide-react";
import { useRef, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { saveWorkflow, listWorkflows, loadWorkflow, runWorkflow, createExecutionSocket } from "../api/api";
import { useI18n } from "../i18n";

export default function Toolbar() {
  const store = useStore();
  const { t } = useI18n();
  const wsRef = useRef(null);
  const handlersRef = useRef({});

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
      toast.dismiss(toastId);
      toast.success(t('toolbar.started'));
      const ws = createExecutionSocket(execution_id);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "log") s.addExecutionLog(msg.data);
        else if (msg.type === "complete") { s.setExecutionStatus("completed"); s.addExecutionLog({ level: "info", message: t('runLog.done') }); wsRef.current = null; }
        else if (msg.type === "error") { s.setExecutionStatus("failed"); s.addExecutionLog({ level: "error", message: msg.error }); wsRef.current = null; }
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

  const handleSave = useCallback(async () => {
    const s = useStore.getState();
    const name = prompt(t('toolbar.promptWorkflowName'), s.currentWorkflowName);
    if (!name) return;
    try {
      const result = await saveWorkflow(name, s.nodes, s.edges, s.currentWorkflowId);
      s.setCurrentWorkflowId(result.id);
      s.setCurrentWorkflowName(name);
      toast.success(t('toolbar.saved'));
    } catch { toast.error("Save failed"); }
  }, [t]);

  const handleLoad = useCallback(async () => {
    try {
      const wfs = await listWorkflows();
      if (wfs.length === 0) return toast(t('toolbar.noSaved'));
      const names = wfs.map((w) => w.id + ": " + w.name).join("\n");
      const id = prompt(t('toolbar.promptLoadId') + "\n\n" + names);
      if (!id) return;
      const wf = await loadWorkflow(parseInt(id));
      useStore.setState({ nodes: wf.nodes || [], edges: wf.edges || [], currentWorkflowId: wf.id, currentWorkflowName: wf.name });
      toast.success(t('toolbar.loaded') + wf.name);
    } catch { toast.error("Load failed"); }
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

  // Keep handlersRef current for the keyboard effect
  handlersRef.current = { handleSave, handleExport, handleLoad };

  // Keyboard shortcuts — uses refs to avoid stale closures
  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') { e.preventDefault(); handlersRef.current.handleSave(); }
      if (ctrl && e.key === 'e') { e.preventDefault(); handlersRef.current.handleExport(); }
      if (ctrl && e.key === 'o') { e.preventDefault(); handlersRef.current.handleLoad(); }
      if (ctrl && e.key === 'z') { e.preventDefault(); useStore.getState().undo(); }
      if (ctrl && e.key === 'y') { e.preventDefault(); useStore.getState().redo(); }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
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
      </div>
      <div className="flex-1" />

      <div className="flex items-center gap-0">
        <TB icon={FolderOpen} label={t('toolbar.loadHint')} onClick={handleLoad} />
        <TB icon={Save} label={t('toolbar.saveHint')} onClick={handleSave} />
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
        <TB icon={Timer} label={t('toolbar.triggerHint')} onClick={() => toast("Coming soon")} />
        <button onClick={handleRun} className="h-7 px-2.5 ml-1 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm shadow-accent-700/20">
          <Play size={11} />{t('toolbar.run')}
        </button>
      </div>
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
