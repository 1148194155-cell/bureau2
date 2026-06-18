import { useState, useEffect, useCallback } from "react";
import { Globe, Key, Database, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Save, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { fetchModels, createModel, deleteModel, fetchApiKeys, createApiKey, deleteApiKey, fetchKnowledgeBases, createKnowledgeBase, indexKnowledgeBase, deleteKnowledgeBase } from "../api/api";
import { useI18n } from "../i18n";

export default function SettingsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("models");
  const [panel, setPanel] = useState(null);
  const [authDisabled, setAuthDisabled] = useState(false);
  const { models, apiKeys, knowledgeBases, outputDir, setModels, setApiKeys, setKnowledgeBases, setOutputDir } = useStore();

  const TABS = [
    { key: "models", label: t('settings.tabs.models'), icon: Globe },
    { key: "apikeys", label: t('settings.tabs.apikeys'), icon: Key },
    { key: "knowledge", label: t('settings.tabs.knowledge'), icon: Database },
  ];

  const loadAll = useCallback(async () => {
    const results = await Promise.allSettled([fetchModels(), fetchApiKeys(), fetchKnowledgeBases()]);
    const setters = [setModels, setApiKeys, setKnowledgeBases];
    let anyFailed = false;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') setters[i](r.value);
      else anyFailed = true;
    });
    if (anyFailed) toast.error(t('settings.loadFailed'));
  }, [t]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(d => { if (d.success) setAuthDisabled(d.data.authDisabled); })
      .catch(() => {});
  }, []);

  return (
    <div className="h-full flex flex-col bg-surface-900">
      <div className="h-11 shrink-0 border-b border-surface-700/40 flex items-center px-5">
        <h1 className="text-xs font-semibold text-surface-300 uppercase tracking-wide">{t('settings.title')}</h1>
      </div>

      <div className="flex gap-0 px-5 pt-3">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={"px-4 py-2 text-xs font-medium rounded-t-xl transition-all flex items-center gap-2 border-b-2 " + (
              activeTab === tab.key ? "text-accent-300 border-accent-500 bg-surface-850" : "text-surface-500 border-transparent hover:text-surface-300 hover:bg-surface-850/50"
            )}>
            <tab.icon size={13} />{tab.label}
          </button>
        ))}
      </div>

      {/* Global output directory config */}
      <div className="px-5 py-3 border-b border-surface-700/40 flex items-center gap-3">
        <span className="text-[10px] font-medium text-surface-400 uppercase tracking-wide">{t('settings.outputDir')}</span>
        <input
          value={outputDir || ''}
          onChange={(e) => setOutputDir(e.target.value)}
          placeholder={t('settings.outputDirPlaceholder')}
          className="flex-1 h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs placeholder-surface-600 outline-none focus:border-accent-500/40"
        />
        <span className="text-[10px] text-surface-500">{t('settings.outputDirHint')}</span>
      </div>

      {/* Auth toggle */}
      <div className="px-5 py-3 border-b border-surface-700/40 flex items-center gap-3">
        <span className="text-[10px] font-medium text-surface-400 uppercase tracking-wide">认证</span>
        <button
          onClick={async () => {
            try {
              const res = await fetch('/api/auth/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disabled: !authDisabled }),
              });
              const data = await res.json();
              if (data.success) {
                setAuthDisabled(data.data.authDisabled);
                toast.success(data.data.authDisabled ? '认证已关闭 — 无需登录' : '认证已开启 — 需要登录');
              }
            } catch { toast.error('切换失败'); }
          }}
          className={`h-6 px-3 rounded-full text-[10px] font-medium transition-colors ${authDisabled ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}
        >
          {authDisabled ? '已关闭' : '已开启'}
        </button>
        <span className="text-[10px] text-surface-500">
          {authDisabled ? '任何人可访问，适合本地单人使用' : '需要登录才能使用，适合多人或公网环境'}
        </span>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "models" && <ModelList models={models} onAdd={() => setPanel({ type: "addModel" })} onDelete={async (id) => { if (confirm(t('settings.confirmDelete'))) { await deleteModel(id); toast.success(t('settings.deleted')); loadAll(); } }} />}
          {activeTab === "apikeys" && <KeyList apiKeys={apiKeys} onAdd={() => setPanel({ type: "addKey" })} onDelete={async (id) => { if (confirm(t('settings.confirmDelete'))) { await deleteApiKey(id); toast.success(t('settings.deleted')); loadAll(); } }} />}
          {activeTab === "knowledge" && <KnowledgeList knowledgeBases={knowledgeBases} models={models} onAdd={() => setPanel({ type: "addKB" })} onDelete={async (id) => { if (confirm(t('settings.confirmDelete'))) { await deleteKnowledgeBase(id); toast.success(t('settings.deleted')); loadAll(); } }} onIndex={async (id) => { await indexKnowledgeBase(id, models.find(m => m.adapter_type === 'builtin' || m.adapter_type === 'openai')?.id); toast.success(t('settings.indexed')); loadAll(); }} />}
        </div>

        {panel && (
          <div className="w-80 bg-surface-850 border-l border-surface-700/40 flex flex-col shrink-0 animate-slide-right">
            <SettingsPanel key={panel.type} type={panel.type} onClose={() => setPanel(null)} onDone={() => { setPanel(null); loadAll(); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ type, onClose, onDone }) {
  const { t } = useI18n();
  const [form, setForm] = useState(type === "addModel" ? { name: "", adapter_type: "openai", endpoint: "", apiKey: "", model: "" } : type === "addKey" ? { name: "", api_key: "" } : { name: "", folder_path: "" });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Key 校验
    if (type === "addModel") {
      const needsKey = form.adapter_type === 'openai' || form.adapter_type === 'anthropic';
      if (needsKey && !form.apiKey.trim()) {
        if (!confirm(t('settings.confirmNoKey') || '未填写 API Key，模型可能无法连接。确定保存？')) return;
      }
    }
    setSaving(true);
    try {
      if (type === "addModel") await createModel({ name: form.name, adapter_type: form.adapter_type, config: { endpoint: form.endpoint, apiKey: form.apiKey, model: form.model } });
      else if (type === "addKey") await createApiKey({ name: form.name, api_key: form.api_key });
      else await createKnowledgeBase({ name: form.name, folder_path: form.folder_path });
      toast.success(t('settings.saved'));
      onDone();
    } catch (err) { toast.error("Save failed: " + err.message); }
    finally { setSaving(false); }
  };

  const titles = { addModel: t('settings.addModel'), addKey: t('settings.addKey'), addKB: t('settings.addKB') };
  const inputCls = "w-full h-7 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs placeholder-surface-600 outline-none focus:border-accent-500/40";
  const F = ({ label, children }) => <div><label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">{label}</label>{children}</div>;

  return (
    <>
      <div className="h-11 flex items-center px-3 border-b border-surface-700/40">
        <span className="text-xs font-semibold text-surface-200">{titles[type]}</span>
        <button onClick={onClose} className="ml-auto text-surface-500 hover:text-surface-300"><X size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {type === "addModel" && <>
          <F label={t('settings.name')}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="GPT-4o" className={inputCls} /></F>
          <F label={t('settings.adapter')}><select value={form.adapter_type} onChange={e => {
    const type = e.target.value;
    // 选择适配器时自动填 endpoint 和 model 的推荐值
    const presets = {
      openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4o" },
      ollama: { endpoint: "http://localhost:11434/v1", model: "qwen2.5:7b" },
      anthropic: { endpoint: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514" },
      llamacpp: { endpoint: "http://localhost:8080", model: "default" },
    };
    const preset = presets[type] || {};
    setForm({ ...form, adapter_type: type, endpoint: preset.endpoint || form.endpoint, model: preset.model || form.model });
  }}
  className={inputCls}><option value="openai">OpenAI (ChatGPT / GPT-4o) — 需要 API Key</option><option value="ollama">Ollama (本地模型，免费) — 需先安装 Ollama</option><option value="anthropic">Anthropic (Claude) — 需要 API Key</option><option value="llamacpp">llama.cpp</option></select></F>
          <F label={t('settings.endpoint')}><input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://api.openai.com/v1" className={inputCls} /></F>
          <F label={t('settings.modelId')}><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="gpt-4o" className={inputCls} /></F>
          <F label={t('settings.key')}><input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." className={inputCls} /></F>
          <p className="text-[9px] text-surface-600 mt-0.5">
            {form.adapter_type === "openai" && "从 platform.openai.com/api-keys 获取，以 sk- 开头"}
            {form.adapter_type === "anthropic" && "从 console.anthropic.com 获取，以 sk-ant- 开头"}
            {form.adapter_type === "ollama" && "Ollama 本地模型无需 Key，留空即可"}
          <br />
          Key 会被 AES-256 加密存储。也可在「API Key」标签页统一管理所有 Key。
          </p>
        </>}

        {type === "addKey" && <>
          <F label={t('settings.name')}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="OpenAI" className={inputCls} /></F>
          <F label={t('settings.key')}><input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="sk-..." className={inputCls} /></F>
        </>}

        {type === "addKB" && <>
          <F label={t('settings.name')}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tech Docs" className={inputCls} /></F>
          <F label={t('settings.folderPath')}><input value={form.folder_path} onChange={(e) => setForm({ ...form, folder_path: e.target.value })} placeholder="D:/docs" className={inputCls} /></F>
        </>}
      </div>

      <div className="p-3 border-t border-surface-700/40 flex justify-end gap-2">
        <button onClick={onClose} className="h-7 px-3 rounded-lg text-surface-400 hover:text-surface-200 text-xs transition-colors">{t('settings.cancel')}</button>
        <button onClick={handleSave} disabled={saving || !form.name} className="h-7 px-4 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-medium flex items-center gap-1 disabled:bg-surface-700 disabled:text-surface-500 transition-colors"><Save size={11} />{t('settings.save')}</button>
      </div>
    </>
  );
}

function ModelList({ models, onAdd, onDelete }) {
  const { t } = useI18n();
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-surface-300">{t('settings.tabs.models')}</h2>
        <button onClick={onAdd} className="h-7 px-3 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-medium flex items-center gap-1 transition-colors"><Plus size={11} />{t('settings.add')}</button>
      </div>
      {models.map((m) => (
        <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-850 border border-surface-700/40 rounded-2xl hover:border-surface-600/50 transition-colors group">
          {m.source === "builtin" ? <div className="w-8 h-8 rounded-xl bg-accent-500/10 flex items-center justify-center"><span className="text-base">🪄</span></div> : <div className="w-8 h-8 rounded-xl bg-accent-500/10 flex items-center justify-center"><Globe size={14} className="text-accent-400" /></div>}
          <div className="flex-1 min-w-0"><div className="text-xs font-medium text-surface-200">{m.name}</div><div className="text-[10px] text-surface-500 mt-0.5">{m.adapter_type}{m.config?.model ? " \u00b7 " + m.config.model : ""}</div></div>
          <div className="flex items-center gap-2">
            {m.online ? <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 size={10} />{t('settings.online')}</span> : <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 flex items-center gap-1" title="暂无响应 — 检查 API 端点是否正确、模型是否在线"><XCircle size={10} /> 未连接</span>}
            {m.source === "builtin" ? null : <button onClick={() => onDelete(m.id)} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>}
          </div>
        </div>
      ))}
      {models.length === 0 && <div className="text-center py-12 text-surface-500 text-xs"><p>{t('settings.tabs.models')} — {t('resource.empty')}</p><p className="mt-1 text-surface-600">{t('resource.emptyHint')}</p></div>}
    </div>
  );
}

function KeyList({ apiKeys, onAdd, onDelete }) {
  const { t } = useI18n();
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-surface-300">{t('settings.tabs.apikeys')}</h2>
        <button onClick={onAdd} className="h-7 px-3 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-medium flex items-center gap-1 transition-colors"><Plus size={11} />{t('settings.add')}</button>
      </div>
      {apiKeys.map((k) => (
        <div key={k.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-850 border border-surface-700/40 rounded-2xl hover:border-surface-600/50 transition-colors group">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center"><Key size={14} className="text-amber-400" /></div>
          <div className="flex-1"><div className="text-xs font-medium text-surface-200">{k.name}</div><div className="text-[10px] text-surface-500 mt-0.5">
            {k.created_at ? new Date(k.created_at).toLocaleDateString() : t('settings.saved')}
          </div></div>
          <button onClick={() => onDelete(k.id)} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
        </div>
      ))}
      {apiKeys.length === 0 && <div className="text-center py-12 text-surface-500 text-xs"><p>{t('settings.tabs.apikeys')} — {t('resource.empty')}</p><p className="mt-1 text-surface-600">{t('resource.emptyHint')}</p></div>}
    </div>
  );
}

function KnowledgeList({ knowledgeBases, models, onAdd, onDelete, onIndex }) {
  const { t } = useI18n();
  const [indexing, setIndexing] = useState(null);
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-surface-300">{t('settings.tabs.knowledge')}</h2>
        <button onClick={onAdd} className="h-7 px-3 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-medium flex items-center gap-1 transition-colors"><Plus size={11} />{t('settings.add')}</button>
      </div>
      {knowledgeBases.map((kb) => (
        <div key={kb.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-850 border border-surface-700/40 rounded-2xl hover:border-surface-600/50 transition-colors group">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center"><Database size={14} className="text-purple-400" /></div>
          <div className="flex-1 min-w-0"><div className="text-xs font-medium text-surface-200">{kb.name}</div><div className="text-[10px] text-surface-500 mt-0.5 truncate">{kb.folder_path}</div></div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            <button onClick={async () => { setIndexing(kb.id); try { await onIndex(kb.id); } finally { setIndexing(null); } }} disabled={indexing === kb.id} className="h-6 px-2 rounded-md text-surface-400 hover:text-surface-200 hover:bg-surface-700 text-[10px] flex items-center gap-1 transition-colors">
              {indexing === kb.id ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}{t('settings.index')}
            </button>
            <button onClick={() => onDelete(kb.id)} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={12} /></button>
          </div>
        </div>
      ))}
      {knowledgeBases.length === 0 && <div className="text-center py-12 text-surface-500 text-xs"><p>{t('settings.tabs.knowledge')} — {t('resource.empty')}</p><p className="mt-1 text-surface-600">{t('resource.emptyHint')}</p></div>}
    </div>
  );
}
