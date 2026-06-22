import { useEffect, useState, useCallback } from "react";
import { FlaskConical, Globe, Brain, Plug, RefreshCw, GripHorizontal, FileOutput, Pencil, Code, GitFork, Workflow } from "lucide-react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { fetchSkills, fetchModels, fetchApis, fetchKnowledgeBases } from "../api/api";
import { useI18n } from "../i18n";

export default function ResourcePanel() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("skills");
  const { skills, models, apis, knowledgeBases, setSkills, setModels, setApis, setKnowledgeBases, addNode } = useStore();
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(d => setTemplates(d.data || [])).catch(() => {});
  }, []);

  const TABS = [
    { key: "skills", label: t('resource.skills'), icon: FlaskConical },
    { key: "knowledgeBases", label: t('resource.knowledge'), icon: Globe },
    { key: "models", label: t('resource.models'), icon: Brain },
    { key: "apis", label: t('resource.apis'), icon: Plug },
  ];

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, m, a, k] = await Promise.all([fetchSkills(), fetchModels(), fetchApis(), fetchKnowledgeBases()]);
      setSkills(s); setModels(m); setApis(a); setKnowledgeBases(k);

      // 检测是否有离线模型
      const userModels = m.filter(x => x.source === 'user');
      const offlineCount = userModels.filter(x => x.online === false).length;
      if (offlineCount > 0) {
        toast(`${offlineCount}/${userModels.length} 个模型无法连接 — 检查 Key 或 API 地址`,
          { icon: '⚠️', duration: 5000, style: { background: '#292524', color: '#fbbf24', fontSize: '12px' } });
      }
    } catch { toast.error(t('resource.loadFailed')); }
    finally { setRefreshing(false); setInitialLoad(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const onDragStartBuiltin = (e) => {
    e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType: "file_output", data: { name: "File Output", desc: "Write workflow result to disk", id: "builtin:file_output" } }));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragStart = (e, item, key) => {
    let nodeType = "skill";
    if (key === "knowledgeBases") nodeType = "knowledge";
    e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType, data: item }));
    e.dataTransfer.effectAllowed = "move";
  };

  const getItems = (key) => {
    switch (key) {
      case "skills": return skills.map((s) => ({ id: s.id, name: s.name || s.id, desc: s.description || s.version, meta: s.version }));
      case "knowledgeBases": return knowledgeBases.map((k) => ({ id: k.id, name: k.name, desc: k.folder_path }));
      case "models": return models.map((m) => ({ id: m.id, name: m.name, desc: m.adapter_type, meta: m.online ? t('resource.online') : t('resource.offline'), online: m.online }));
      case "apis": return apis.map((a) => ({ id: a.id, name: a.name, desc: a.method + " " + (a.url || "").substring(0, 30) }));
      default: return [];
    }
  };

  const items = getItems(activeTab);

  return (
    <div className="w-56 bg-surface-850 border-r border-surface-700/40 flex flex-col shrink-0">
      <div className="h-9 flex items-center px-1.5 border-b border-surface-700/40 gap-0">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={"h-7 px-2 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-all " + (
              activeTab === tab.key ? "bg-surface-750 text-surface-200" : "text-surface-500 hover:text-surface-300 hover:bg-surface-700/30"
            )}>
            <tab.icon size={11} />{tab.label}
          </button>
        ))}
        <button onClick={load} disabled={refreshing} className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-surface-300 transition-colors" title={t('resource.refresh')}>
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.map((item) => (
          <div key={item.id} draggable={activeTab === 'skills' || activeTab === 'knowledgeBases'} onDragStart={(e) => onDragStart(e, item, activeTab)}
            className={"px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 transition-all group " + (activeTab === 'skills' || activeTab === 'knowledgeBases' ? "cursor-grab active:cursor-grabbing hover:border-surface-500/50 hover:bg-surface-750/50" : "cursor-default")}>
            <div className="flex items-center gap-1.5">
              <GripHorizontal size={10} className="text-surface-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-xs font-medium text-surface-200 truncate flex-1">{item.name}</span>
              {item.meta && (
                <span className={"text-[9px] px-1 py-0.5 rounded-md shrink-0 " + (item.online === false ? "bg-surface-700 text-surface-500" : "bg-surface-700 text-surface-400")}>
                  {item.meta}
                </span>
              )}
            </div>
            {item.desc && <div className="text-[10px] text-surface-500 truncate mt-0.5 ml-[22px]">{item.desc}</div>}
          </div>
        ))}
        {items.length === 0 && !refreshing && !initialLoad && <div className="text-xs text-surface-600 italic text-center py-8">{t('resource.empty')}</div>}
        {items.length === 0 && refreshing && <div className="flex items-center justify-center py-8 gap-2"><div className="w-3 h-3 rounded-full border-2 border-surface-600 border-t-accent-400 animate-spin" /><span className="text-xs text-surface-500">加载中...</span></div>}
        {items.length === 0 && initialLoad && !refreshing && <div className="flex items-center justify-center py-8 gap-2"><div className="w-3 h-3 rounded-full border-2 border-surface-600 border-t-accent-400 animate-spin" /><span className="text-xs text-surface-500">加载中...</span></div>}
      </div>

      {/* Built-in nodes */}
      <div className="border-t border-surface-700/40 px-2 py-1.5">

        {/* 模板区 */}
        {templates.length > 0 && (
          <>
            <button onClick={() => setShowTemplates(!showTemplates)}
              className="w-full flex items-center justify-between text-[9px] font-medium text-surface-500 uppercase tracking-wider px-1.5 mb-1">
              模板 <span>{showTemplates ? '收起' : '展开'}</span>
            </button>
            {showTemplates && templates.map(tmpl => (
              <button key={tmpl.id} onClick={() => {
                const st = useStore.getState();
                st._pushUndo();
                // 给模板节点换上唯一 ID
                const idMap = {};
                const remapId = (oldId) => {
                  if (!idMap[oldId]) idMap[oldId] = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                  return idMap[oldId];
                };
                const newNodes = tmpl.nodes.map(n => {
                  const newId = remapId(n.id);
                  return { ...n, id: newId, data: { ...n.data, nodeId: newId, label: n.data?.label || n.type } };
                });
                const newEdges = tmpl.edges.map(e => ({
                  ...e,
                  id: `tpl_edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  source: idMap[e.source],
                  target: idMap[e.target],
                }));
                st.loadCanvas(newNodes, newEdges);
                st.setCurrentWorkflowName(tmpl.name);
                toast.success(`已加载模板: ${tmpl.name}`);
              }}
                className="w-full text-left px-2.5 py-1.5 mb-1 rounded-xl bg-surface-800/50 border border-surface-700/30 hover:border-accent-500/30 hover:bg-surface-750/50 transition-all">
                <div className="text-[10px] font-medium text-surface-200">{tmpl.name}</div>
                <div className="text-[9px] text-surface-500">{tmpl.description}</div>
              </button>
            ))}
            <div className="text-[9px] font-medium text-surface-600 uppercase tracking-wider mb-1 px-1.5">{t('resource.builtin')}</div>
          </>
        )}

        {templates.length === 0 && (
          <div className="text-[9px] font-medium text-surface-600 uppercase tracking-wider mb-1 px-1.5">{t('resource.builtin')}</div>
        )}

        {/* 基础节点 */}
        {/* Input node */}
        <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType: "input", data: { name: t('resource.inputNode'), desc: t('resource.inputNodeDesc'), id: "builtin:input" } })); e.dataTransfer.effectAllowed = "move"; }}
          className="px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 cursor-grab active:cursor-grabbing hover:border-blue-500/40 hover:bg-surface-750/50 transition-all group">
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={10} className="text-surface-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0"><Pencil size={11} className="text-blue-400" /></div>
            <span className="text-xs font-medium text-surface-200 truncate flex-1">{t('resource.inputNode')}</span>
          </div>
          <div className="text-[10px] text-surface-500 truncate mt-0.5 ml-[22px]">{t('resource.inputNodeDesc')}</div>
        </div>

        {/* Model node */}
        <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType: "model", data: { name: t('resource.modelNode'), desc: t('resource.modelNodeDesc'), id: "builtin:model" } })); e.dataTransfer.effectAllowed = "move"; }}
          className="px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 cursor-grab active:cursor-grabbing hover:border-rose-500/40 hover:bg-surface-750/50 transition-all group mt-1">
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={10} className="text-surface-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-5 h-5 rounded-md bg-rose-500/10 flex items-center justify-center shrink-0"><Brain size={11} className="text-rose-400" /></div>
            <span className="text-xs font-medium text-surface-200 truncate flex-1">{t('resource.modelNode')}</span>
          </div>
          <div className="text-[10px] text-surface-500 truncate mt-0.5 ml-[22px]">{t('resource.modelNodeDesc')}</div>
        </div>

        <div className="w-full h-px bg-surface-700/30 my-1" />

        {/* 高级节点 */}
        {/* API node */}
        <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType: "api_caller", data: { name: t('resource.apiNode'), desc: t('resource.apiNodeDesc'), id: "builtin:api" } })); e.dataTransfer.effectAllowed = "move"; }}
          className="px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 cursor-grab active:cursor-grabbing hover:border-cyan-500/40 hover:bg-surface-750/50 transition-all group">
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={10} className="text-surface-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-5 h-5 rounded-md bg-cyan-500/10 flex items-center justify-center shrink-0"><Globe size={11} className="text-cyan-400" /></div>
            <span className="text-xs font-medium text-surface-200 truncate flex-1">{t('resource.apiNode')}</span>
          </div>
          <div className="text-[10px] text-surface-500 truncate mt-0.5 ml-[22px]">{t('resource.apiNodeDesc')}</div>
        </div>

        {/* Code node */}
        <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType: "code", data: { name: t('resource.codeNode'), desc: t('resource.codeNodeDesc'), id: "builtin:code" } })); e.dataTransfer.effectAllowed = "move"; }}
          className="px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 cursor-grab active:cursor-grabbing hover:border-purple-500/40 hover:bg-surface-750/50 transition-all group mt-1">
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={10} className="text-surface-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-5 h-5 rounded-md bg-purple-500/10 flex items-center justify-center shrink-0"><Code size={11} className="text-purple-400" /></div>
            <span className="text-xs font-medium text-surface-200 truncate flex-1">{t('resource.codeNode')}</span>
          </div>
          <div className="text-[10px] text-surface-500 truncate mt-0.5 ml-[22px]">{t('resource.codeNodeDesc')}</div>
        </div>

        {/* Condition node */}
        <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType: "condition", data: { name: t('resource.conditionNode'), desc: t('resource.conditionNodeDesc'), id: "builtin:condition" } })); e.dataTransfer.effectAllowed = "move"; }}
          className="px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 cursor-grab active:cursor-grabbing hover:border-orange-500/40 hover:bg-surface-750/50 transition-all group mt-1">
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={10} className="text-surface-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-5 h-5 rounded-md bg-orange-500/10 flex items-center justify-center shrink-0"><GitFork size={11} className="text-orange-400" /></div>
            <span className="text-xs font-medium text-surface-200 truncate flex-1">{t('resource.conditionNode')}</span>
          </div>
          <div className="text-[10px] text-surface-500 truncate mt-0.5 ml-[22px]">{t('resource.conditionNodeDesc')}</div>
        </div>

        {/* Workflow node (sub-workflow) */}
        <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType: "workflow", data: { name: "子流程", desc: "嵌入已有工作流作为子流程", id: "builtin:workflow" } })); e.dataTransfer.effectAllowed = "move"; }}
          className="px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 cursor-grab active:cursor-grabbing hover:border-violet-500/40 hover:bg-surface-750/50 transition-all group mt-1">
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={10} className="text-surface-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0"><Workflow size={11} className="text-violet-400" /></div>
            <span className="text-xs font-medium text-surface-200 truncate flex-1">子流程</span>
          </div>
          <div className="text-[10px] text-surface-500 truncate mt-0.5 ml-[22px]">嵌入已有工作流作为子流程</div>
        </div>

        <div className="w-full h-px bg-surface-700/30 my-1" />

        {/* 输出节点 */}
        {/* File Output */}
        <div draggable onDragStart={onDragStartBuiltin}
          className="px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 cursor-grab active:cursor-grabbing hover:border-teal-500/40 hover:bg-surface-750/50 transition-all group">
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={10} className="text-surface-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-5 h-5 rounded-md bg-teal-500/10 flex items-center justify-center shrink-0"><FileOutput size={11} className="text-teal-400" /></div>
            <span className="text-xs font-medium text-surface-200 truncate flex-1">{t('resource.fileOutput')}</span>
          </div>
          <div className="text-[10px] text-surface-500 truncate mt-0.5 ml-[22px]">{t('resource.fileOutputDesc')}</div>
        </div>
      </div>
    </div>
  );
}
