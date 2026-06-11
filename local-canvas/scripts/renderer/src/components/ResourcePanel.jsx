import { useEffect, useState, useCallback } from "react";
import { FlaskConical, Globe, Brain, Plug, RefreshCw, GripHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { fetchSkills, fetchModels, fetchApis, fetchKnowledgeBases } from "../api/api";
import { useI18n } from "../i18n";

export default function ResourcePanel() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("skills");
  const { skills, models, apis, knowledgeBases, setSkills, setModels, setApis, setKnowledgeBases, addNode } = useStore();

  const TABS = [
    { key: "skills", label: t('resource.skills'), icon: FlaskConical },
    { key: "knowledgeBases", label: t('resource.knowledge'), icon: Globe },
    { key: "models", label: t('resource.models'), icon: Brain },
    { key: "apis", label: t('resource.apis'), icon: Plug },
  ];

  const load = useCallback(async () => {
    try {
      const [s, m, a, k] = await Promise.all([fetchSkills(), fetchModels(), fetchApis(), fetchKnowledgeBases()]);
      setSkills(s); setModels(m); setApis(a); setKnowledgeBases(k);
    } catch { toast.error(t('resource.loadFailed')); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        <button onClick={load} className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-surface-300 transition-colors" title={t('resource.refresh')}>
          <RefreshCw size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.map((item) => (
          <div key={item.id} draggable onDragStart={(e) => onDragStart(e, item, activeTab)}
            className="px-2.5 py-2 rounded-xl bg-surface-800/50 border border-surface-700/30 cursor-grab active:cursor-grabbing hover:border-surface-500/50 hover:bg-surface-750/50 transition-all group">
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
        {items.length === 0 && <div className="text-xs text-surface-600 italic text-center py-8">{t('resource.empty')}</div>}
      </div>
    </div>
  );
}
