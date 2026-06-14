import { ReactFlowProvider } from "@xyflow/react";
import { useRef, useEffect } from "react";
import Toolbar from "../components/Toolbar";
import ResourcePanel from "../components/ResourcePanel";
import Canvas from "../components/Canvas";
import AIChat from "../components/AIChat";
import NodeConfigPopover from "../components/NodeConfigPopover";
import EdgeMappingModal from "../components/EdgeMappingModal";
import RunLogWindow from "../components/RunLogWindow";
import PrivacyBadge from "../components/PrivacyBadge";
import ErrorBoundary from "../components/ErrorBoundary";
import useStore from "../store/store";

export default function CanvasPage() {
  const { aiPanelWidth, setAiPanelWidth, isDirty } = useStore();
  const resizeRef = useRef(null);
  const resizing = useRef(false);

  // 未保存更改提示
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

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

  return (
    <ErrorBoundary>
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
        <PrivacyBadge />
      </div>
    </ReactFlowProvider>
    </ErrorBoundary>
  );
}
