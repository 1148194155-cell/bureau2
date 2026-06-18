import { useRef, useState, useEffect } from "react";
import { X, Eraser, Download, Loader2, CheckCircle2, XCircle, Square, Copy, ChevronRight, ChevronDown, GitCompare } from "lucide-react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { useI18n } from "../i18n";
import { cancelExecution, compareExecutions } from "../api/api";

export default function RunLogWindow() {
  const { t } = useI18n();
  const { runLogOpen, setRunLogOpen, executionLogs, executionStatus, executionResults, executionHistory } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState("logs"); // "logs" | "results" | "compare"
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [pos, setPos] = useState(() => {
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

  const hasResults = executionResults.length > 0;

  // Auto-switch to results tab when execution completes with results
  useEffect(() => {
    if (executionStatus === "completed" && hasResults) {
      setActiveTab("results");
    }
  }, [executionStatus, hasResults]);

  if (!runLogOpen) return null;

  return (
    <div
      className="fixed z-50 w-[440px] h-[420px] bg-[#0a0a0a] border border-surface-700/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-pop-in"
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
              title="ÂèñÊ∂àÊâßË°å">
              <Square size={10} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 ml-3">
          <button
            onClick={() => setActiveTab("logs")}
            className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
              activeTab === "logs" ? "bg-surface-700/60 text-surface-200" : "text-surface-500 hover:text-surface-300"
            }`}
          >
            Êó•Âøó
          </button>
          <button
            onClick={() => setActiveTab("results")}
            className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
              activeTab === "results" ? "bg-surface-700/60 text-surface-200" : "text-surface-500 hover:text-surface-300"
            }`}
          >
            ÁªìÊûú{hasResults ? ` (${executionResults.length})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("compare")}
            className={`text-[10px] px-2 py-0.5 rounded-md transition-colors flex items-center gap-0.5 ${
              activeTab === "compare" ? "bg-surface-700/60 text-surface-200" : "text-surface-500 hover:text-surface-300"
            }`}
          >
            <GitCompare size={10} />
            ÂØπÊØî
          </button>
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          {activeTab === "logs" && (
            <>
              <button onClick={() => useStore.setState({ executionLogs: [] })} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-surface-300 transition-colors" title={t('runLog.clear')}>
                <Eraser size={11} />
              </button>
              <button onClick={exportLogs} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-surface-300 transition-colors" title={t('runLog.export')}>
                <Download size={11} />
              </button>
            </>
          )}
          <button onClick={() => setRunLogOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-surface-300 transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "logs" ? (
        <LogView logs={executionLogs} t={t} />
      ) : activeTab === "compare" ? (
        <CompareView
          history={executionHistory}
          compareA={compareA} setCompareA={setCompareA}
          compareB={compareB} setCompareB={setCompareB}
          compareResult={compareResult} setCompareResult={setCompareResult}
          compareLoading={compareLoading} setCompareLoading={setCompareLoading}
        />
      ) : (
        <ResultsView results={executionResults} />
      )}
    </div>
  );
}

function LogView({ logs, t }) {
  return (
    <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed space-y-0.5">
      {logs.length === 0 && (
        <div className="text-amber-500/40 py-8 text-center">{t('runLog.waiting')}</div>
      )}
      {logs.map((log, i) => (
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
                <button onClick={() => toast.success(`Êñá‰ª∂Â∑≤‰øùÂ≠òÂà∞: ${filePath}`, { duration: 6000 })}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent-500/10 text-accent-400 hover:bg-accent-500/20 transition-colors">
                  ÊâìÂºÄÊñá‰ª∂
                </button>
                <button onClick={() => { navigator.clipboard.writeText(filePath); toast.success('Â∑≤Â§çÂà∂Ë∑ØÂæÑ'); }}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-700/50 text-surface-400 hover:text-surface-300 transition-colors">
                  Â§çÂà∂Ë∑ØÂæÑ
                </button>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

function ResultsView({ results }) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {results.length === 0 && (
        <div className="text-surface-500 text-xs py-8 text-center">ÊöÇÊó†ËäÇÁÇπÁªìÊûú</div>
      )}
      {results.map((r, i) => (
        <NodeResultItem key={r.nodeId || i} result={r} />
      ))}
    </div>
  );
}

function NodeResultItem({ result }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = result.skipped ? 'border-gray-500/30' :
    result.success ? 'border-emerald-500/30' : 'border-red-500/30';
  const statusBg = result.skipped ? 'bg-gray-500/5' :
    result.success ? 'bg-emerald-500/5' : 'bg-red-500/5';
  const dotColor = result.skipped ? 'bg-gray-500' :
    result.success ? 'bg-emerald-400' : 'bg-red-400';

  return (
    <div className={`rounded-lg border ${statusColor} ${statusBg} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-800/30 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
        <span className="text-xs font-medium text-surface-200 flex-1 truncate">
          {result.nodeName || result.nodeId}
        </span>
        {result.error && (
          <span className="text-[10px] text-red-400 truncate max-w-[120px]">{result.error}</span>
        )}
        <button onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(JSON.stringify(result.output, null, 2));
          toast.success('Â∑≤Â§çÂà∂');
        }}
          className="text-surface-600 hover:text-surface-300 p-0.5"
        >
          <Copy size={11} />
        </button>
        {expanded ? <ChevronDown size={12} className="text-surface-500" /> : <ChevronRight size={12} className="text-surface-500" />}
      </button>

      {/* Expanded output */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-surface-700/30 pt-2">
          {result.output === null || result.output === undefined ? (
            <span className="text-[11px] text-surface-500 italic font-mono">null</span>
          ) : typeof result.output === 'string' ? (
            <pre className="text-[11px] text-surface-300 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{result.output}</pre>
          ) : (
            <pre className="text-[11px] text-surface-300 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ©§©§ Execution Compare View ©§©§

function CompareView({ history, compareA, setCompareA, compareB, setCompareB, compareResult, setCompareResult, compareLoading, setCompareLoading }) {
  const handleCompare = async () => {
    if (!compareA || !compareB) return;
    setCompareLoading(true);
    try {
      const result = await compareExecutions(compareA, compareB);
      setCompareResult(result);
    } catch (err) {
      toast.error('∂‘±» ß∞‹: ' + (err?.response?.data?.error || err.message));
    } finally {
      setCompareLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div className="text-[10px] text-surface-500 uppercase tracking-wider">—°‘Ò¡Ω¥Œ÷¥––Ω¯––∂‘±»</div>
      <div className="space-y-2">
        <div><div className="text-[10px] text-surface-500 mb-0.5">÷¥–– A</div>
          <select value={compareA} onChange={e => setCompareA(e.target.value)}
            className="w-full bg-surface-800 border border-surface-600/40 rounded-lg px-2 py-1.5 text-xs text-surface-200 outline-none">
            <option value="">—°‘Ò÷¥––...</option>
            {history.map(id => <option key={id} value={id}>{id.slice(0, 8)}...</option>)}
          </select>
        </div>
        <div><div className="text-[10px] text-surface-500 mb-0.5">÷¥–– B</div>
          <select value={compareB} onChange={e => setCompareB(e.target.value)}
            className="w-full bg-surface-800 border border-surface-600/40 rounded-lg px-2 py-1.5 text-xs text-surface-200 outline-none">
            <option value="">—°‘Ò÷¥––...</option>
            {history.map(id => <option key={id} value={id}>{id.slice(0, 8)}...</option>)}
          </select>
        </div>
      </div>
      <button onClick={handleCompare} disabled={!compareA || !compareB || compareLoading}
        className="w-full py-1.5 rounded-lg bg-accent-500/10 text-accent-400 text-xs font-medium hover:bg-accent-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1">
        <GitCompare size={12} />{compareLoading ? '∂‘±»÷–...' : 'ø™ º∂‘±»'}
      </button>
      {compareResult && (
        <div className="space-y-2 mt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-800/50 rounded-lg p-2">
              <div className="text-[10px] text-surface-500 mb-0.5">÷¥–– A</div>
              <div className="text-xs text-surface-200 space-y-0.5">
                <Row label="◊¥Ã¨" value={compareResult.a.status} cls={compareResult.a.status === 'completed' ? 'text-emerald-400' : 'text-red-400'} />
                <Row label="»’÷æ" value={compareResult.a.logCount} />
                <Row label="¥ÌŒÛ" value={compareResult.a.errorCount} />
                {compareResult.diff.durationA != null && <Row label="∫ƒ ±" value={(compareResult.diff.durationA / 1000).toFixed(1) + 's'} />}
              </div>
            </div>
            <div className="bg-surface-800/50 rounded-lg p-2">
              <div className="text-[10px] text-surface-500 mb-0.5">÷¥–– B</div>
              <div className="text-xs text-surface-200 space-y-0.5">
                <Row label="◊¥Ã¨" value={compareResult.b.status} cls={compareResult.b.status === 'completed' ? 'text-emerald-400' : 'text-red-400'} />
                <Row label="»’÷æ" value={compareResult.b.logCount} />
                <Row label="¥ÌŒÛ" value={compareResult.b.errorCount} />
                {compareResult.diff.durationB != null && <Row label="∫ƒ ±" value={(compareResult.diff.durationB / 1000).toFixed(1) + 's'} />}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-surface-600 text-center">
            {compareResult.diff.sameStatus ? '? ◊¥Ã¨“ª÷¬' : '? ◊¥Ã¨≤ªÕ¨'} | ¥ÌŒÛ∏¸∂‡: {compareResult.diff.moreErrorsIn === 'equal' ? 'œ‡Õ¨' : '÷¥–– ' + compareResult.diff.moreErrorsIn}
          </div>
        </div>
      )}
      {history.length === 0 && <div className="text-surface-500 text-xs py-8 text-center">‘›Œﬁ÷¥––¿˙ ∑£¨‘À––∫Ûº¥ø…∂‘±»</div>}
    </div>
  );
}

function Row({ label, value, cls }) {
  return <div className="flex justify-between"><span className="text-surface-500">{label}</span><span className={cls || ''}>{value}</span></div>;
}
