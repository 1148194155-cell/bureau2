/**
 * ModelStore — 内置模型商店，小白一键安装
 * 
 * 展示热门 AI 提供商，点击即可配置：
 * - OpenAI / DeepSeek / SiliconFlow → 只需 API Key
 * - Ollama → 引导安装本地模型
 * - 免费模型推荐
 */
import { useState } from "react";
import { Globe, ExternalLink, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { createModel } from "../api/api";
import useStore from "../store/store";

const STORE_PROVIDERS = [
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    desc: '🚀 国内直连，注册送免费额度，无需海外信用卡',
    docs: 'https://siliconflow.cn',
    endpoint: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-7B-Instruct', 'THUDM/glm-4-9b-chat'],
    feature: '🎁 注册即送 200 万 Token',
    difficulty: 'easy',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    desc: '🌐 ChatGPT / GPT-4o，全球最流行的 AI 模型',
    docs: 'https://platform.openai.com/api-keys',
    endpoint: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'],
    feature: '⭐ 最稳定，需要海外信用卡',
    difficulty: 'hard',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    desc: '🇨🇳 国产最强，性价比极高，国内可注册',
    docs: 'https://platform.deepseek.com',
    endpoint: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    feature: '💰 价格仅为 OpenAI 的 1/10',
    difficulty: 'easy',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    desc: '🏠 完全免费本地运行，无需联网，无需 API Key',
    docs: 'https://ollama.ai',
    endpoint: 'http://localhost:11434/v1',
    models: ['qwen2.5:7b', 'llama3.2', 'gemma2:9b'],
    feature: '🆓 完全免费，断网也能用',
    difficulty: 'local',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    desc: '🧠 Claude 系列，编程和长文本最擅长',
    docs: 'https://console.anthropic.com',
    endpoint: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-3-20250313'],
    feature: '💪 编码能力强，需要海外信用卡',
    difficulty: 'hard',
  },
];

const EASY_MODELS = ['siliconflow', 'deepseek'];

export default function ModelStore({ onClose, onDone }) {
  const [step, setStep] = useState('browse'); // browse | configure
  const [selected, setSelected] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const handleSelect = (provider) => {
    setSelected(provider);
    setApiKey('');
    setInstalled(false);
    setStep('configure');
  };

  const handleInstall = async () => {
    setInstalling(true);
    try {
      if (selected.difficulty === 'local') {
        // Ollama — no API key needed, install all models
        for (const model of selected.models) {
          try {
            await createModel({
              name: model,
              adapter_type: 'ollama',
              config: { endpoint: selected.endpoint, model },
            });
          } catch { /* skip duplicates */ }
        }
        toast.success(`Ollama 配置完成！记得先启动 Ollama 客户端`);
      } else {
        // Cloud provider — needs API key
        if (!apiKey.trim()) {
          toast.error('请输入 API Key');
          setInstalling(false);
          return;
        }
        for (const model of selected.models.slice(0, 3)) {
          try {
            await createModel({
              name: model,
              adapter_type: selected.id,
              config: { endpoint: selected.endpoint, apiKey, model },
            });
          } catch { /* skip duplicates */ }
        }
        toast.success(`✅ ${selected.name} 配置成功！`);
      }
      
      // Refresh models list
      const { fetchModels } = await import('../api/api');
      const modelsList = await fetchModels();
      useStore.getState().setModels(modelsList);
      setInstalled(true);
      setTimeout(() => { onDone(); onClose(); }, 1500);
    } catch (err) {
      toast.error(err.message || '安装失败');
    } finally {
      setInstalling(false);
    }
  };

  if (step === 'configure' && selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => setStep('browse')} className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1">
          ← 返回商店
        </button>
        
        <div className="p-4 rounded-xl bg-surface-800/50 border border-surface-700/40">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center text-xl">{selected.id === 'siliconflow' ? '🚀' : selected.id === 'openai' ? '🌐' : selected.id === 'deepseek' ? '🇨🇳' : selected.id === 'ollama' ? '🏠' : '🧠'}</div>
            <div>
              <div className="text-sm font-semibold text-surface-200">{selected.name}</div>
              <div className="text-[10px] text-surface-500">{selected.desc}</div>
            </div>
          </div>

          <div className="text-[10px] text-surface-400 mb-3">{selected.feature}</div>

          {selected.difficulty === 'local' ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-600/20 text-[10px] text-amber-300">
                Ollama 不需要 API Key。请先下载 Ollama 客户端，然后运行以下命令拉取模型：
                <code className="block mt-1 p-2 rounded bg-surface-800 text-surface-200 font-mono text-[9px]">ollama pull qwen2.5:7b</code>
              </div>
              <div className="flex gap-2">
                <a href="https://ollama.ai/download" target="_blank" rel="noopener"
                  className="flex-1 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 text-xs flex items-center justify-center gap-1 transition-colors">
                  <ExternalLink size={11} /> 下载 Ollama
                </a>
                <button onClick={handleInstall} disabled={installing}
                  className="flex-1 h-8 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 text-surface-950 text-xs font-medium transition-colors">
                  {installing ? '配置中...' : '我已安装，配置模型'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-medium text-surface-500 uppercase block mb-1">API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder={`粘贴 ${selected.name} 的 API Key...`}
                  className="w-full h-8 px-2 rounded-lg bg-surface-800 border border-surface-600/50 text-surface-200 text-xs placeholder-surface-600 font-mono outline-none focus:border-accent-500/40" />
                <p className="text-[9px] text-surface-500 mt-1">
                  Key 会被 AES-256 加密，安全存储在本地。
                  {selected.difficulty === 'easy' && EASY_MODELS.includes(selected.id) && ' 🇨🇳 国内可注册，无需海外支付方式。'}
                </p>
              </div>
              <div className="flex gap-2">
                <a href={selected.docs} target="_blank" rel="noopener"
                  className="h-8 px-3 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-400 text-[10px] flex items-center gap-1 transition-colors">
                  <ExternalLink size={10} /> 去获取 Key
                </a>
                <button onClick={handleInstall} disabled={installing || !apiKey.trim()}
                  className="flex-1 h-8 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 text-surface-950 text-xs font-medium transition-colors flex items-center justify-center gap-1">
                  {installing ? <><Loader2 size={12} className="animate-spin" /> 安装中...</> : installed ? '✅ 已安装' : '一键安装'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-accent-400" />
        <span className="text-xs font-medium text-surface-200">选择 AI 提供商，一键配置</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {STORE_PROVIDERS.map(p => {
          const isEasy = p.difficulty === 'easy' || p.difficulty === 'local';
          return (
            <button key={p.id} onClick={() => handleSelect(p)}
              className="text-left px-3 py-3 rounded-xl bg-surface-800/50 border border-surface-700/30 hover:border-accent-500/40 hover:bg-surface-750/50 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-700/50 flex items-center justify-center text-lg shrink-0">
                  {p.id === 'siliconflow' ? '🚀' : p.id === 'openai' ? '🌐' : p.id === 'deepseek' ? '🇨🇳' : p.id === 'ollama' ? '🏠' : '🧠'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-surface-200">{p.name}</span>
                    {isEasy && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">推荐</span>}
                  </div>
                  <div className="text-[10px] text-surface-500 mt-0.5 line-clamp-1">{p.desc}</div>
                  <div className="text-[9px] text-surface-400 mt-0.5">{p.feature}</div>
                </div>
                <span className="text-[10px] text-accent-400 group-hover:mr-0.5 transition-all">选择 →</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-3 rounded-xl bg-amber-900/10 border border-amber-600/20 text-[10px] text-amber-300">
        💡 **新用户推荐**：SiliconFlow（国内注册，送免费额度）或 DeepSeek（性价比极高）
      </div>
    </div>
  );
}
