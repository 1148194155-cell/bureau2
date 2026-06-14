import { Handle, Position } from "@xyflow/react";
import { Brain } from "lucide-react";

export default function ModelNode({ data, selected }) {
  return (
    <div className={"px-3 py-2 rounded-2xl border-2 min-w-[140px] shadow-lg transition-all " + (
      selected ? "border-accent-400 shadow-accent-500/15" : "border-rose-500/30 shadow-rose-500/5"
    ) + " bg-surface-850"}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <Brain size={13} className="text-rose-400" />
        </div>
        <span className="text-xs font-semibold text-surface-100 truncate max-w-[110px]">{data.label || "Model"}</span>
      </div>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-rose-400 !border-2 !border-surface-850 !rounded-full" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-rose-400 !border-2 !border-surface-850 !rounded-full" />
    </div>
  );
}
