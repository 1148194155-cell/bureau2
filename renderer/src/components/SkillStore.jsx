/**
 * SkillStore — 内置技能商店，浏览和安装技能
 * 
 * 对标 ModelStore，展示预置技能列表，一键安装到本地。
 */
import { useState, useEffect } from "react";
import { Download, CheckCircle2, Loader2, Sparkles, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { fetchSkillStore, installSkill } from "../api/api";

export default function SkillStore({ onClose, onDone }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const data = await fetchSkillStore(); setSkills(data || []); }
    catch { toast.error("加载技能商店失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleInstall = async (skill) => {
    setInstalling(skill.id);
    try {
      await installSkill(skill.id);
      toast.success(`${skill.name} 安装成功！`);
      await load();
      if (onDone) onDone();
    } catch (err) {
      toast.error(err.status === 409 ? "技能已安装" : (err.message || "安装失败"));
    } finally { setInstalling(null); }
  };

  return (
    <div className="h-full flex flex-col bg-surface-850">
      <div className="h-10 shrink-0 border-b border-surface-700/40 flex items-center px-3 gap-2">
        <Sparkles size={13} className="text-accent-400" />
        <span className="text-xs font-medium text-surface-200 flex-1">技能商店</span>
        <button onClick={load} disabled={loading}
          className="w-6 h-6 flex items-center justify-center rounded-md text-surface-500 hover:text-surface-300 transition-colors"
          title="刷新">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
        {onClose && (
          <button onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-surface-500 hover:text-surface-300 transition-colors text-xs">
            ×
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && skills.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={18} className="text-surface-500 animate-spin" />
          </div>
        )}

        {!loading && skills.length === 0 && (
          <div className="text-center py-12">
            <div className="text-3xl mb-2">📦</div>
            <div className="text-xs text-surface-500">暂无可安装的技能</div>
            <div className="text-[10px] text-surface-600 mt-1">技能商店正在建设中，敬请期待更多技能</div>
          </div>
        )}

        {skills.map((skill) => (
          <div key={skill.id}
            className="rounded-xl bg-surface-800/50 border border-surface-700/30 hover:border-surface-500/50 transition-all p-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-500/10 flex items-center justify-center text-lg shrink-0"
                style={{ lineHeight: 1 }}>
                {skill.icon || "⚡"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-surface-200">{skill.name}</span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-surface-700 text-surface-400">
                    {skill.version || "1.0.0"}
                  </span>
                  {skill.installed && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle2 size={9} /> 已安装
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-surface-500 mt-0.5 leading-relaxed">
                  {skill.description}
                </div>
                {skill.author && (
                  <div className="text-[9px] text-surface-600 mt-1">作者: {skill.author}</div>
                )}
              </div>
              <button
                onClick={() => handleInstall(skill)}
                disabled={skill.installed || installing === skill.id}
                className={`h-7 px-3 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all active:scale-95 ${
                  skill.installed
                    ? "bg-emerald-500/20 text-emerald-400 cursor-default"
                    : "bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 text-surface-950 disabled:text-surface-500"
                }`}
              >
                {installing === skill.id ? (
                  <><Loader2 size={10} className="animate-spin" /> 安装中</>
                ) : skill.installed ? (
                  <><CheckCircle2 size={10} /> 已安装</>
                ) : (
                  <><Download size={10} /> 安装</>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
