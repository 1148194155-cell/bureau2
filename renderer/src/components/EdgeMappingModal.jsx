import { useState } from "react";
import { X, ArrowRight } from "lucide-react";
import useStore from "../store/store";
import { useI18n } from "../i18n";

export default function EdgeMappingModal() {
  const { t } = useI18n();
  const { edgeMapping, setEdgeMapping, setEdgeData } = useStore();
  if (!edgeMapping) return null;

  const { source, target, connection } = edgeMapping;
  const sourceFields =
    source.type === "skill" ? ["output", "result", "text", "data"] :
    source.type === "knowledge" ? ["documents", "chunks", "context"] :
    source.type === "model" ? ["content", "usage", "raw"] :
    source.type === "api_caller" ? ["body", "status", "headers"] :
    source.type === "code" ? ["result", "output"] :
    ["output"];

  const targetFields =
    target.type === "skill" ? ["input", "text", "prompt", "data"] :
    target.type === "knowledge" ? ["query", "search", "filter"] :
    target.type === "model" ? ["prompt", "system", "input"] :
    target.type === "condition" ? ["input", "value"] :
    target.type === "api_caller" ? ["body", "query", "url"] :
    ["input"];

  const [sourceField, setSourceField] = useState(sourceFields[0]);
  const [targetField, setTargetField] = useState(targetFields[0]);

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
              // 找到刚创建的边（按 source+target 匹配）
              const edges = useStore.getState().edges;
              const edge = [...edges].reverse().find(
                (e) => e.source === connection.source && e.target === connection.target
              );
              if (edge) {
                setEdgeData(edge.id, {
                  mapping: { [targetField]: sourceField },
                });
              }
            }
            setEdgeMapping(null);
          }} className="h-7 px-4 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-medium transition-colors">{t('edgeMapping.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
