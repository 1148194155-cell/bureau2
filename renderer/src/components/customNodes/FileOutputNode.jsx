import { Handle, Position } from "@xyflow/react";
import { FileOutput } from "lucide-react";

export default function FileOutputNode({ data, selected }) {
  return (
    <div className={"px-3 py-2 rounded-2xl border-2 min-w-[130px] shadow-lg transition-all " + (
      selected ? "border-accent-400 shadow-accent-500/15" : "border-teal-500/30 shadow-teal-500/5"
    ) + " bg-surface-850"}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl bg-teal-500/10 flex items-center justify-center">
          <FileOutput size={13} className="text-teal-400" />
        </div>
        <span className="text-xs font-semibold text-surface-100 truncate max-w-[110px]">{data.label || 'File Output'}</span>
        {data.config?.format && <span className="text-[9px] px-1 py-0.5 rounded-md bg-surface-700/50 text-teal-400 shrink-0 font-mono">{data.config.format}</span>}
      </div>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-teal-400 !border-2 !border-surface-850 !rounded-full" />
    </div>
  );
}
