import { ArrowRight, Sparkles, Settings, MousePointer } from "lucide-react";
import { useState } from "react";
import useStore from "../store/store";

export default function OnboardingOverlay() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('lc_onboarding_dismissed') === '1'; }
    catch { return false; }
  });
  const nodes = useStore(s => s.nodes);

  // 只在用户主动"跳过"后才永久隐藏；
  // "去设置"按钮不算永久隐藏——下次打开空画布还会出现
  if (dismissed) return null;
  if (nodes.length > 0) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
      <div className="bg-surface-850 border border-surface-600/40 rounded-2xl p-8 max-w-md text-center space-y-6 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-accent-500/10 flex items-center justify-center mx-auto">
          <Sparkles size={24} className="text-accent-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-surface-200">欢迎使用 Local Canvas</h2>
          <p className="text-xs text-surface-500 mt-2 leading-relaxed">
            一个完全在你电脑上运行的 AI 工作流工具。<br />
            数据不外传，无需付费，无需注册。
          </p>
        </div>

        <div className="space-y-3 text-left">
          <Step icon={Settings} num="1" text="先去「设置」添加一个模型" sub="支持 OpenAI / Ollama / Anthropic" />
          <Step icon={MousePointer} num="2" text="从左边拖节点到画布上" sub="把模型、Skill、知识库拖进来" />
          <Step icon={ArrowRight} num="3" text="连线 → 点运行" sub="或右边 AI 对话框里打字让它帮你搭" />
        </div>

        <div className="flex gap-2 justify-center">
          <button onClick={() => {
            setDismissed(true);
            try { localStorage.setItem('lc_onboarding_dismissed', '1'); } catch {}
          }}
            className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-xs text-surface-300 transition-colors">
            跳过
          </button>
          <button onClick={() => {
            useStore.getState().setNavigateToPage("settings");
            // 不 setDismissed — 回来如果画布还是空的仍然显示
          }}
            className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-xs text-surface-950 font-medium transition-colors flex items-center gap-1.5">
            去设置 <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ icon: Icon, num, text, sub }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-lg bg-surface-700 flex items-center justify-center shrink-0 text-[10px] font-medium text-surface-300">{num}</div>
      <div>
        <div className="text-xs text-surface-200">{text}</div>
        <div className="text-[10px] text-surface-500">{sub}</div>
      </div>
    </div>
  );
}
