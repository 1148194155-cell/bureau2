import { Handle, Position } from "@xyflow/react";
import { Send } from "lucide-react";

export default function OutputNode({ data, selected }) {
  return (
    <div className={"px-3 py-2 rounded-2xl border-2 min-w-[130px] shadow-lg transition-all " + (
      selected ? "border-accent-400 shadow-accent-500/15" : "border-amber-600/30 shadow-amber-500/5"
    ) + " bg-surface-850"}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Send size={13} className="text-amber-400" />
        </div>
        <span className="text-xs font-semibold text-surface-100 truncate max-w-[110px]">{data.label}</span>
        {data.status && <span className="text-[9px] px-1 py-0.5 rounded-md bg-surface-700/50 text-surface-400 shrink-0">{data.status}</span>}
      </div>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-amber-400 !border-2 !border-surface-850 !rounded-full" />
    </div>
  );
}
