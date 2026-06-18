import { ArrowRight, Sparkles, Settings, MousePointer, Zap } from "lucide-react";
import { useState } from "react";
import useStore from "../store/store";
import toast from "react-hot-toast";

export default function OnboardingOverlay() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('localcanvas_quick_start_loaded') === '1'; }
    catch { return false; }
  });
  const nodes = useStore(s => s.nodes);
  const models = useStore(s => s.models);
  const hasModel = models?.some(m => m.online);
  const [demoRunning, setDemoRunning] = useState(false);

  const handleQuickDemo = async () => {
    setDemoRunning(true);
    const s = useStore.getState();
    // Clear canvas and load a demo workflow
    s.clearCanvas();
    s.setCurrentWorkflowName("体验演示");

    // Create demo nodes: input + model/output hybrid
    const inputId = `demo_in_${Date.now()}`;
    const outId = `demo_out_${Date.now()}`;

    s.addNode("input", { label: "输入", input: "你好，Local Canvas！" }, { x: 120, y: 220 });
    if (hasModel) {
      s.addNode("model", { label: "AI 处理", systemPrompt: "你是一个友好的AI助手。请用中文回复用户的问候。", prompt: "{{input}}", temperature: 0.7, max_tokens: 256 }, { x: 440, y: 220 });
    } else {
      s.addNode("code", { label: "演示处理", code: '({ reply: "👋 你好！这是 Local Canvas 的演示模式。\\n\\n要让它真正变智能，请到「设置」页面添加一个模型（OpenAI / Ollama）。\\n\\n你的输入是: " + (input?.input || JSON.stringify(input).slice(0,50)) })' }, { x: 440, y: 220 });
    }
    s.addNode("output", { label: "输出结果" }, { x: 740, y: 220 });

    // Connect all
    const e1Id = `demo_e1_${Date.now()}`;
    const e2Id = `demo_e2_${Date.now()}`;
    // Get actual node IDs from store
    setTimeout(() => {
      const st = useStore.getState();
      const ns = st.nodes;
      const inNode = ns.find(n => n.data?.label === "输入");
      const midNode = ns.find(n => n.data?.label?.includes("处理") || n.data?.label?.includes("AI"));
      const outNode = ns.find(n => n.data?.label === "输出结果");
      if (inNode && midNode && outNode) {
        useStore.setState({
          edges: [
            { id: e1Id, source: inNode.id, target: midNode.id },
            { id: e2Id, source: midNode.id, target: outNode.id },
          ],
          isDirty: true,
        });
      }
      setDemoRunning(false);
      toast.success(hasModel ? "演示工作流已就绪，点「运行」试试！" : "演示工作流已就绪（无需模型），点「运行」试试！", { icon: "🎉", duration: 5000 });
    }, 100);
  };

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
          <button onClick={handleQuickDemo} disabled={demoRunning}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-accent-600 to-violet-600 hover:from-accent-500 hover:to-violet-500 text-xs text-white font-semibold transition-all flex items-center gap-1.5 shadow-lg shadow-accent-700/20 disabled:opacity-50">
            <Zap size={13} />{demoRunning ? "加载中..." : "一键体验"}
          </button>
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
