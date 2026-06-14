import { Handle, Position } from "@xyflow/react";
import { Globe } from "lucide-react";

export default function ApiNode({ data, selected }) {
  return (
    <div className={"px-3 py-2 rounded-2xl border-2 min-w-[140px] shadow-lg transition-all " + (
      selected ? "border-accent-400 shadow-accent-500/15" : "border-cyan-500/30 shadow-cyan-500/5"
    ) + " bg-surface-850"}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl bg-cyan-500/10 flex items-center justify-center">
          <Globe size={13} className="text-cyan-400" />
        </div>
        <span className="text-xs font-semibold text-surface-100 truncate max-w-[110px]">{data.label || "API"}</span>
      </div>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-surface-850 !rounded-full" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-surface-850 !rounded-full" />
    </div>
  );
}
