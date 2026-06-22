import { useState } from "react";
import { X, ArrowRight } from "lucide-react";
import useStore from "../store/store";
import { useI18n } from "../i18n";

export default function EdgeMappingModal() {
  const { t } = useI18n();
  const { edgeMapping, setEdgeMapping, setEdgeData } = useStore();

  // Compute fields from mapping (always, before early return)
  const sourceFields = !edgeMapping ? [] :
    edgeMapping.source.type === "skill" ? ["output", "result", "text", "data"] :
    edgeMapping.source.type === "knowledge" ? ["documents", "chunks", "context"] :
    edgeMapping.source.type === "model" ? ["content", "usage", "raw"] :
    edgeMapping.source.type === "api_caller" ? ["body", "status", "headers"] :
    edgeMapping.source.type === "code" ? ["result", "output"] :
    ["output"];

  const targetFields = !edgeMapping ? [] :
    edgeMapping.target.type === "skill" ? ["input", "text", "prompt", "data"] :
    edgeMapping.target.type === "knowledge" ? ["query", "search", "filter"] :
    edgeMapping.target.type === "model" ? ["prompt", "system", "input"] :
    edgeMapping.target.type === "condition" ? ["input", "value"] :
    edgeMapping.target.type === "api_caller" ? ["body", "query", "url"] :
    ["input"];

  // Hooks must be called unconditionally — before any early return
  const [sourceField, setSourceField] = useState(sourceFields[0] || "output");
  const [targetField, setTargetField] = useState(targetFields[0] || "input");

  if (!edgeMapping) return null;

  const { source, target, connection } = edgeMapping;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[380px] bg-surface-850 border border-surface-600/50 rounded-2xl shadow-2xl animate-pop-in">
        <div className="h-10 flex items-center px-4 border-b border-surface-700/40">
          <span className="text-xs font-semibold text-surface-200">{t('edgeMapping.title')}</span>
          <button onClick={() => setEdgeMapping(null)} className="ml-auto text-surface-500 hover:text-surface-300"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-4 text-xs">
          <div className="flex items-center gap-2 justify-center py-2">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-medium">{source.data?.label}</div>
            <ArrowRight size={14} className="text-surface-500" />
            <div className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] font-medium">{target.data?.label}</div>
          </div>
          <div><label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('edgeMapping.sourceOutput')}</label>
            <select value={sourceField} onChange={(e) => setSourceField(e.target.value)}
              className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-[11px] outline-none">
              {sourceFields.map((f) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </div>
          <div><label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('edgeMapping.targetInput')}</label>
            <select value={targetField} onChange={(e) => setTargetField(e.target.value)}
              className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-[11px] outline-none">
              {targetFields.map((f) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </div>
        </div>
        <div className="p-3 border-t border-surface-700/40 flex justify-end gap-2">
          <button onClick={() => setEdgeMapping(null)} className="h-7 px-3 rounded-lg text-surface-400 hover:text-surface-200 text-xs transition-colors">{t('edgeMapping.cancel')}</button>
          <button onClick={() => {
            if (connection?.source && connection?.target) {
              const state = useStore.getState();
              state._pushUndo();
              const edgeId = `edge_${connection.source}_${connection.target}_${Date.now()}`;
              state.onConnect({ source: connection.source, target: connection.target, id: edgeId });
              state.setEdgeData(edgeId, { mapping: { [targetField]: sourceField } });
            }
            setEdgeMapping(null);
          }} className="h-7 px-4 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-medium transition-colors">{t('edgeMapping.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
