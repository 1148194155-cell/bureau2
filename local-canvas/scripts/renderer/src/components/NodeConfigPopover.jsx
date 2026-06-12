import { useState, useEffect, useRef } from "react";
import { Trash2, X, FlaskConical, Globe, Send, FileOutput } from "lucide-react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { useI18n } from "../i18n";

const TYPE_ICONS = { skill: FlaskConical, knowledge: Globe, output: Send, file_output: FileOutput };
const TYPE_COLORS = { skill: "emerald", knowledge: "purple", output: "amber", file_output: "teal" };

export default function NodeConfigPopover() {
  const { t } = useI18n();
  const { selectedNode, selectedNodeEl, setSelectedNode, updateNodeData, removeNode, models } = useStore();
  const [config, setConfig] = useState({});
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (selectedNode && selectedNodeEl) {
      const rect = selectedNodeEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 - 140 });
    }
  }, [selectedNode, selectedNodeEl]);

  useEffect(() => {
    if (!selectedNode) return;
    const handler = (e) => { if (popoverRef.current && !popoverRef.current.contains(e.target)) setSelectedNode(null, null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedNode]);

  if (!selectedNode) return null;

  const node = selectedNode;
  const nodeData = node.data || {};
  const Icon = TYPE_ICONS[node.type] || FlaskConical;
  const color = TYPE_COLORS[node.type] || "accent";

  const handleSave = () => {
    updateNodeData(node.id, { config: { ...nodeData.config, ...config } });
    setSelectedNode(null, null);
    toast.success(t('nodeConfig.saved'));
  };

  const handleDelete = () => {
    if (!confirm(t('nodeConfig.confirmDelete'))) return;
    removeNode(node.id);
    setSelectedNode(null, null);
    toast.success(t('nodeConfig.deleted'));
  };

  return (
    <div ref={popoverRef} className="fixed z-50 w-72 bg-surface-850 border border-surface-600/50 rounded-2xl shadow-2xl animate-pop-in"
      style={{ top: pos.top, left: pos.left }}>
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-surface-850" />

      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-700/40">
        <div className={"w-7 h-7 rounded-lg bg-" + color + "-500/10 flex items-center justify-center"}>
          <Icon size={13} className={"text-" + color + "-400"} />
        </div>
        <input value={config.label || nodeData.label || ""} onChange={(e) => setConfig({ ...config, label: e.target.value })}
          className="flex-1 bg-transparent text-xs font-medium text-surface-200 outline-none border-none" />
        <button onClick={() => setSelectedNode(null, null)} className="text-surface-500 hover:text-surface-300"><X size={14} /></button>
      </div>

      <div className="p-3 space-y-3 text-xs">
        <div>
          <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.nodeId')}</label>
          <input disabled value={node.id} className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-400 text-[10px] font-mono" />
        </div>

        {(node.type === "skill" || node.type === "knowledge") && (
          <div>
            <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.model')}</label>
            <select value={config.model_id || nodeData.config?.model_id || ""}
              onChange={(e) => setConfig({ ...config, model_id: e.target.value })}
              className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs outline-none">
              <option value="">{t('nodeConfig.none')}</option>
              {models.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
          </div>
        )}

        {node.type === "skill" && (
          <div>
            <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.apiKey')}</label>
            <input type="password" value={config.apiKey || nodeData.config?.apiKey || ""}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} placeholder="sk-..."
              className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs placeholder-surface-600 outline-none" />
          </div>
        )}

        {node.type === "file_output" && (
          <>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.outputFormat')}</label>
              <select value={config.format || nodeData.config?.format || "json"}
                onChange={(e) => setConfig({ ...config, format: e.target.value })}
                className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs outline-none">
                <option value="txt">TXT (text)</option>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="html">HTML</option>
                <option value="md">Markdown</option>
                <option value="xml">XML</option>
                <option value="yaml">YAML</option>
                <option value="toml">TOML</option>
                <option value="env">.env</option>
                <option value="ini">INI</option>
                <option value="log">Log</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="xlsx">XLSX</option>
                <option value="pptx">PPTX</option>
                <option value="png">PNG (image)</option>
                <option value="jpg">JPG (image)</option>
                <option value="gif">GIF (image)</option>
                <option value="webp">WebP (image)</option>
                <option value="svg">SVG (vector)</option>
                <option value="mp4">MP4 (video)</option>
                <option value="webm">WebM (video)</option>
                <option value="mov">MOV (video)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.outputDir')}</label>
              <input value={config.outputDir || nodeData.config?.outputDir || ""}
                onChange={(e) => setConfig({ ...config, outputDir: e.target.value })} placeholder="output/"
                className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs placeholder-surface-600 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.fileName')}</label>
              <input value={config.fileName || nodeData.config?.fileName || ""}
                onChange={(e) => setConfig({ ...config, fileName: e.target.value })} placeholder="output_2026"
                className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs placeholder-surface-600 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.template')}</label>
              <textarea
                value={config.template || nodeData.config?.template || ""}
                onChange={(e) => setConfig({ ...config, template: e.target.value })}
                rows={3} placeholder={'<h1>{{title}}</h1>\n<p>{{content}}</p>'}
                className="w-full px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-[10px] placeholder-surface-600 font-mono resize-none outline-none" />
            </div>
          </>
        )}

        <div>
          <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.params')}</label>
          <textarea
            value={config.params ? JSON.stringify(config.params, null, 2) : nodeData.config?.params ? JSON.stringify(nodeData.config.params, null, 2) : ""}
            onChange={(e) => { try { const v = e.target.value.trim(); setConfig({ ...config, params: v ? JSON.parse(v) : undefined }); } catch {} }}
            rows={4} placeholder='{"temperature": 0.7}'
            className="w-full px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-[10px] placeholder-surface-600 font-mono resize-none outline-none" />
        </div>

        {nodeData.input_schema && <div className="text-[10px] text-surface-500 font-mono">{">"} input: {JSON.stringify(nodeData.input_schema)}</div>}
        {nodeData.output_schema && <div className="text-[10px] text-surface-500 font-mono">{"<"} output: {JSON.stringify(nodeData.output_schema)}</div>}
      </div>

      <div className="px-3 py-2.5 border-t border-surface-700/40 flex gap-2">
        <button onClick={handleDelete} className="flex-1 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium flex items-center justify-center gap-1 transition-colors">
          <Trash2 size={11} />{t('nodeConfig.delete')}
        </button>
        <button onClick={handleSave} className="flex-[2] h-7 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-medium transition-colors">
          {t('nodeConfig.save')}
        </button>
      </div>
    </div>
  );
}
