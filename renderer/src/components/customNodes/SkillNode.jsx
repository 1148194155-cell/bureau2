import { Handle, Position } from "@xyflow/react";
import { FlaskConical } from "lucide-react";

export default function SkillNode({ data, selected }) {
  return (
    <div className={"px-3 py-2 rounded-2xl border-2 min-w-[140px] shadow-lg transition-all " + (
      selected ? "border-accent-400 shadow-accent-500/15" : "border-emerald-600/30 shadow-emerald-500/5"
    ) + " bg-surface-850"}>
      <div className="flex items-center gap-2 mb-0.5">
        <div className="w-7 h-7 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <FlaskConical size={13} className="text-emerald-400" />
        </div>
        <span className="text-xs font-semibold text-surface-100 truncate max-w-[110px]">{data.label || "Skill"}</span>
        {data.status && <span className="text-[9px] px-1 py-0.5 rounded-md bg-surface-700/50 text-surface-400 shrink-0">{data.status}</span>}
      </div>
      {data.description && <div className="text-[10px] text-surface-500 leading-tight truncate max-w-[150px]">{data.description}</div>}
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-surface-850 !rounded-full" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-surface-850 !rounded-full" />
    </div>
  );
}
