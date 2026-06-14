import { ReactFlowProvider } from "@xyflow/react";
import { useRef, useEffect, useCallback } from "react";
import Toolbar from "../components/Toolbar";
import ResourcePanel from "../components/ResourcePanel";
import Canvas from "../components/Canvas";
import AIChat from "../components/AIChat";
import NodeConfigPopover from "../components/NodeConfigPopover";
import EdgeMappingModal from "../components/EdgeMappingModal";
import RunLogWindow from "../components/RunLogWindow";
import useStore from "../store/store";
import { saveWorkflow, listWorkflows, loadWorkflow } from "../api/api";
import toast from "react-hot-toast";
import { useI18n } from "../i18n";

export default function CanvasPage() {
  const { aiPanelWidth, setAiPanelWidth } = useStore();
  const resizeRef = useRef(null);
  const resizing = useRef(false);
  const { t } = useI18n();

  const onMouseDown = (e) => {
    resizing.current = true;
    const startX = e.clientX;
    const startW = aiPanelWidth;
    const onMove = (ev) => setAiPanelWidth(startW - (ev.clientX - startX));
    const onUp = () => { resizing.current = false; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.userSelect = ""; document.body.style.cursor = ""; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };


  // 键盘快捷键 Ctrl+S/E/O/Z/Y
  const handleKeyDown = useCallback((e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!e.ctrlKey && !e.metaKey) return;
    const s = useStore.getState();
    switch (e.key.toLowerCase()) {
      case 's':
        e.preventDefault();
        (async () => {
          const name = prompt(t('toolbar.promptWorkflowName'), s.currentWorkflowName);
          if (!name) return;
          try {
            const result = await saveWorkflow(name, s.nodes, s.edges, s.currentWorkflowId);
            s.setCurrentWorkflowId(result.id);
            s.setCurrentWorkflowName(name);
            toast.success(t('toolbar.saved'));
          } catch { toast.error('Save failed'); }
        })();
        break;
      case 'e':
        e.preventDefault();
        const json = JSON.stringify({ nodes: s.nodes, edges: s.edges, name: s.currentWorkflowName }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = (s.currentWorkflowName || 'workflow') + '.json'; a.click();
        URL.revokeObjectURL(url);
        toast.success(t('toolbar.exported'));
        break;
      case 'o':
        e.preventDefault();
        (async () => {
          try {
            const wfs = await listWorkflows();
            if (wfs.length === 0) return toast(t('toolbar.noSaved'));
            const names = wfs.map((w) => w.id + ': ' + w.name).join('\n');
            const id = prompt(t('toolbar.promptLoadId') + '\n\n' + names);
            if (!id) return;
            const wf = await loadWorkflow(parseInt(id));
            useStore.setState({ nodes: wf.nodes || [], edges: wf.edges || [], currentWorkflowId: wf.id, currentWorkflowName: wf.name });
            toast.success(t('toolbar.loaded') + wf.name);
          } catch { toast.error('Load failed'); }
        })();
        break;
      case 'z':
        if (s.undoStack.length > 0) { e.preventDefault(); s._pushUndo(); s.undo(); }
        break;
      case 'y':
        if (s.redoStack.length > 0) { e.preventDefault(); s.redo(); }
        break;
    }
  }, [t]);

  useEffect(() => { document.addEventListener('keydown', handleKeyDown); return () => document.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);

  return (
    <ReactFlowProvider>
      <div className="h-full flex flex-col">
        <Toolbar />
        <div className="flex-1 flex overflow-hidden relative">
          <ResourcePanel />
          <Canvas />

          {/* Resize handle */}
          <div ref={resizeRef} onMouseDown={onMouseDown} className="resize-handle shrink-0" />

          {/* Fixed AI Chat panel */}
          <div style={{ width: aiPanelWidth }} className="shrink-0 border-l border-surface-700/40">
            <AIChat />
          </div>
        </div>

        <NodeConfigPopover />
        <EdgeMappingModal />
        <RunLogWindow />
      </div>
    </ReactFlowProvider>
  );
}

