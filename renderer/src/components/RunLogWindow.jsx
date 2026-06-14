import { useRef, useState, useEffect } from "react";
import { X, Eraser, Download, Loader2, CheckCircle2, XCircle, Square } from "lucide-react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { useI18n } from "../i18n";
import { cancelExecution } from "../api/api";

export default function RunLogWindow() {
  const { t } = useI18n();
  const { runLogOpen, setRunLogOpen, executionLogs, executionStatus } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState(() => {
    // Center the window on initial open
    return { x: Math.max(40, (window.innerWidth - 400) / 2), y: Math.max(60, (window.innerHeight - 320) / 2) };
  });
  const dragRef = useRef(null);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = (e) => {
    setIsDragging(true);
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const onMove = (ev) => setPos({ x: ev.clientX - offset.current.x, y: ev.clientY - offset.current.y });
    const onUp = () => { setIsDragging(false); document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const exportLogs = () => {
    const text = executionLogs.map((l) => "[" + (l.level || "info") + "] " + (l.timestamp ? new Date(l.timestamp).toISOString() : "") + " " + l.message).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "execution.log"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!runLogOpen) return null;

  return (
    <div
      className="fixed z-50 w-[400px] h-[320px] bg-[#0a0a0a] border border-surface-700/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-pop-in"
      style={{ left: pos.x, top: pos.y, right: "auto" }}
    >
      {/* Title bar (draggable) */}
      <div
        ref={dragRef}
        onMouseDown={onMouseDown}
        className={"h-8 flex items-center px-3 bg-surface-850 border-b border-surface-700/40 shrink-0 " + (isDragging ? "cursor-grabbing" : "cursor-grab")}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-surface-500 font-bold tracking-widest font-mono">{t('runLog.title')}</span>
          {executionStatus === "running" && <Loader2 size={10} className="text-amber-400 animate-spin" />}
          {executionStatus === "completed" && <CheckCircle2 size={10} className="text-emerald-400" />}
          {executionStatus === "failed" && <XCircle size={10} className="text-red-400" />}
          {executionStatus === "running" && (
            <button onClick={async () => {
              const id = useStore.getState().executionId;
              if (!id) return;
              try { await cancelExecution(id); } catch {}
            }}
              className="w-5 h-5 flex items-center justify-center rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors ml-0.5"
              title="取消执行">
              <Square size={10} />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={() => useStore.setState({ executionLogs: [] })} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-surface-300 transition-colors" title={t('runLog.clear')}>
            <Eraser size={11} />
          </button>
          <button onClick={exportLogs} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-surface-300 transition-colors" title={t('runLog.export')}>
            <Download size={11} />
          </button>
          <button onClick={() => setRunLogOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-surface-300 transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Log content */}
      <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed space-y-0.5">
        {executionLogs.length === 0 && (
          <div className="text-amber-500/40 py-8 text-center">{t('runLog.waiting')}</div>
        )}
        {executionLogs.map((log, i) => (
          <div key={i}>
            <div className={"px-1 " + (
              log.level === "error" ? "text-red-400" :
              log.level === "warn" ? "text-amber-400" :
              "text-amber-400/70"
            )}>
              <span className="text-surface-700 mr-2 select-none">
                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "--:--:--"}
              </span>
              {log.message}
            </div>
            {log.level === 'info' && log.message.includes('File written:') && (() => {
              const match = log.message.match(/File written:\s*(.+?)\s*\((\d+)\s*bytes/);
              if (!match) return null;
              const filePath = match[1];
              return (
                <div className="mt-1 ml-[64px] flex items-center gap-1">
                  <button onClick={() => {
                    const ext = filePath.split('.').pop().toLowerCase();
                    if (['html','png','jpg','jpeg','gif','svg','webp','json','txt','md','csv'].includes(ext)) {
                      window.open(`file:///${filePath.replace(/\\/g, '/')}`, '_blank');
                    } else {
                      navigator.clipboard.writeText(filePath);
                      toast.success('路径已复制: ' + filePath);
                    }
                  }} className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent-500/10 text-accent-400 hover:bg-accent-500/20 transition-colors">
                    打开文件
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(filePath); toast.success('已复制路径'); }}
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-700/50 text-surface-400 hover:text-surface-300 transition-colors">
                    复制路径
                  </button>
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
