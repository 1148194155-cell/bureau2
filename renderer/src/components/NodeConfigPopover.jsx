import { useState, useEffect, useRef } from "react";
import { Trash2, X, FlaskConical, Globe, Send, FileOutput, Brain, Pencil, GitFork, Code } from "lucide-react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { useI18n } from "../i18n";
import ConditionEditor from "./ConditionEditor";

const TYPE_ICONS = {
  skill: FlaskConical, knowledge: Globe, output: Send, file_output: FileOutput,
  model: Brain, input: Pencil, condition: GitFork, code: Code, api_caller: Globe,
};
const TYPE_COLORS = {
  skill: "emerald", knowledge: "purple", output: "amber", file_output: "teal",
  model: "rose", input: "blue", condition: "orange", code: "purple", api_caller: "cyan",
};

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

  // 切换节点时重置 config 为节点已有配置（深拷贝避免引用共享）
  useEffect(() => {
    if (selectedNode) {
      setConfig(JSON.parse(JSON.stringify(selectedNode.data?.config || {})));
    }
  }, [selectedNode?.id]);

  useEffect(() => {
    if (!selectedNode) return;
    const handler = (e) => {
      // 忽略 select 下拉选项的点击（浏览器原生下拉在 DOM 之外，contains 为 false）
      if (e.target.closest('select')) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setSelectedNode(null, null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedNode]);

  if (!selectedNode) return null;

  const node = selectedNode;
  const nodeData = node.data || {};
  const Icon = TYPE_ICONS[node.type] || FlaskConical;
  const color = TYPE_COLORS[node.type] || "accent";

  const handleSave = () => {
    // 用 config 覆盖 nodeData.config，显式传递 null/undefined/空字符串以支持清空字段
    const merged = { ...nodeData.config };
    for (const [k, v] of Object.entries(config)) {
      if (v === undefined) delete merged[k];
      else merged[k] = v;
    }
    updateNodeData(node.id, { config: merged });
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
                {['txt','json','csv','html','md','png','svg'].map(f => (
                  <option key={f} value={f}>{f.toUpperCase()}</option>
                ))}
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

        {/* ★ model 节点：模型绑定 + system prompt + temperature + max_tokens */}
        {node.type === "model" && (
          <>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.model')}</label>
              <select value={config.model_id || nodeData.config?.model_id || ""}
                onChange={(e) => setConfig({ ...config, model_id: e.target.value })}
                className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs outline-none">
                <option value="">{t('nodeConfig.none')}</option>
                {models.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">System Prompt</label>
              <textarea value={config.systemPrompt || nodeData.config?.systemPrompt || ""}
                onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
                rows={2} placeholder="你是一个专业的翻译助手..."
                className="w-full px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-[10px] placeholder-surface-600 font-mono resize-none outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">Temperature</label>
                <input type="number" step="0.1" min="0" max="2"
                  value={config.temperature ?? nodeData.config?.temperature ?? 0.7}
                  onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                  className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">Max Tokens</label>
                <input type="number" min="1" max="128000"
                  value={config.max_tokens ?? nodeData.config?.max_tokens ?? 2048}
                  onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) })}
                  className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs outline-none" />
              </div>
            </div>
          </>
        )}

        {/* ★ input 节点：默认值 */}
        {node.type === "input" && (
          <div>
            <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">默认值</label>
            <textarea value={config.input || nodeData.config?.input || ""}
              onChange={(e) => setConfig({ ...config, input: e.target.value })}
              rows={2} placeholder="输入你想翻译的中文..."
              className="w-full px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-[10px] placeholder-surface-600 font-mono resize-none outline-none" />
            <p className="text-[9px] text-surface-600 mt-0.5">运行工作流时会作为初始数据传递给下游节点</p>
          </div>
        )}

        {/* ★ condition 节点：可视化条件编辑器 */}
        {node.type === "condition" && (
          <div>
            <ConditionEditor
              config={config.expression ? { raw: config.expression } : (config.conditions ? config : { conditions: [], logic: "&&" })}
              onChange={(editorCfg) => {
                if (editorCfg.raw) {
                  setConfig({ ...config, expression: editorCfg.raw });
                } else {
                  // Convert visual conditions to expression string
                  const parts = editorCfg.conditions.map(c => {
                    const field = c.field || "output";
                    switch (c.op) {
                      case "==": case "!=": case ">": case ">=": case "<": case "<=":
                        return `input.${field} ${c.op} ${JSON.stringify(c.value)}`;
                      case "includes": return `String(input.${field}).includes("${c.value}")`;
                      case "startsWith": return `String(input.${field}).startsWith("${c.value}")`;
                      case "endsWith": return `String(input.${field}).endsWith("${c.value}")`;
                      case "regex": return `/\\b${c.value}\\b/.test(String(input.${field}))`;
                      case "truthy": return `!!input.${field}`;
                      case "falsy": return `!input.${field}`;
                      default: return `input.${field} ${c.op} ${c.value}`;
                    }
                  });
                  const expr = parts.length === 0 ? "true" : parts.join(` ${editorCfg.logic} `);
                  setConfig({ ...config, expression: expr, conditions: editorCfg.conditions, logic: editorCfg.logic });
                }
              }}
            />
          </div>
        )}

        {/* ★ code 节点：代码编辑器 + 超时 */}
        {node.type === "code" && (
          <>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">JavaScript 代码</label>
              <textarea value={config.code || nodeData.config?.code || ""}
                onChange={(e) => setConfig({ ...config, code: e.target.value })}
                rows={5} placeholder={`// input 是上游数据\nconst result = input.text.toUpperCase();\nresult;`}
                className="w-full px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-[10px] placeholder-surface-600 font-mono resize-none outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">超时 (ms)</label>
              <input type="number" min="100" max="30000"
                value={config.timeout ?? nodeData.config?.timeout ?? 5000}
                onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) })}
                className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs outline-none" />
            </div>
          </>
        )}

        {/* ★ api_caller 节点：URL + Method + Headers + Body */}
        {node.type === "api_caller" && (
          <>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">URL</label>
              <input value={config.url || nodeData.config?.url || ""}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
                placeholder="https://api.example.com/data"
                className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs placeholder-surface-600 font-mono outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">Method</label>
              <select value={config.method || nodeData.config?.method || "GET"}
                onChange={(e) => setConfig({ ...config, method: e.target.value })}
                className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs outline-none">
                {['GET','POST','PUT','DELETE','PATCH'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">Headers (JSON)</label>
              <textarea value={config.headers ? JSON.stringify(config.headers, null, 2) : ""}
                onChange={(e) => { try { const v = JSON.parse(e.target.value); setConfig({ ...config, headers: v }); } catch {} }}
                rows={2} placeholder='{"Authorization": "Bearer xxx"}'
                className="w-full px-2 py-1.5 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-[10px] placeholder-surface-600 font-mono resize-none outline-none" />
            </div>
          </>
        )}

        {/* ★ workflow 节点：选择子流程 */}
        {node.type === "workflow" && (
          <div>
            <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">子流程 ID</label>
            <input value={config.workflowId || nodeData.config?.workflowId || ""}
              onChange={(e) => setConfig({ ...config, workflowId: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="输入已保存的工作流 ID"
              className="w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs placeholder-surface-600 font-mono outline-none" />
            <p className="text-[9px] text-surface-600 mt-0.5">保存画布后获得 ID，填入此处即可作为子流程嵌入</p>
          </div>
        )}

        <div>
          <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{t('nodeConfig.params')}</label>
          <textarea
            value={config.params ? JSON.stringify(config.params, null, 2) : nodeData.config?.params ? JSON.stringify(nodeData.config.params, null, 2) : ""}
            onChange={(e) => { try { const v = e.target.value.trim(); setConfig({ ...config, params: v ? JSON.parse(v) : undefined }); } catch {} }}
            rows={4} placeholder={`{"prompt": "把以下内容翻译成英文: {{input}}", "temperature": 0.7}`}
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
