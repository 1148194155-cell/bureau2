import path from 'node:path';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import { BaseModelAdapter } from './adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
export const DEFAULT_MODEL_PATH = path.join(PROJECT_ROOT, 'models', 'builtin.gguf');

export class BuiltinAdapter extends BaseModelAdapter {
  constructor(config = {}) {
    super(config);
    this.modelPath = config.modelPath || DEFAULT_MODEL_PATH;
    this.name = config.name || '内置模型 (本地)';
    this._llama = null;
    this._model = null;
    this._session = null;
    this._ready = false;
    this._loading = false;
    this._loadError = null;
    this._error = null;
  }

  async _ensureLoaded() {
    if (this._ready) return;
    if (this._loading) {
      // Another caller is already loading — wait for it
      let attempts = 0;
      while (this._loading && attempts < 600) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (this._ready) return;
      if (this._loadError) throw new Error(`Builtin model failed to load: ${this._loadError.message}`);
      throw new Error('Builtin model loading timed out');
    }
    this._loading = true;
    try {
      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`模型文件未找到: ${this.modelPath}`);
      }
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
      this._llama = await getLlama();
      this._model = await this._llama.loadModel({ modelPath: this.modelPath });
      const context = await this._model.createContext();
      const sequence = context.getSequence();
      this._session = new LlamaChatSession({ contextSequence: sequence });
      this._ready = true;
    } catch (err) {
      this._loadError = err;
      throw err;
    } finally {
      this._loading = false;
    }
  }

  async chat(messages, options = {}) {
    await this._ensureLoaded();
    const prompt = this._buildPrompt(messages, options.tools);
    const response = await this._session.prompt(prompt, {
      temperature: options.temperature ?? 0.7,
      maxTokens: options.max_tokens ?? 2048,
    });
    const toolCalls = this._extractToolCalls(response);
    const content = this._stripToolCalls(response);

    // Fallback: 检测到工具调用意图但解析失败 → 降级提示
    if (toolCalls.length === 0 && options.tools?.length > 0 && this.detectToolIntent(response)) {
      return {
        content: content
          ? content + '\n\n⚠️ 本地模型未能正确生成操作指令。请尝试用更明确的方式描述你的需求，或切换到云端模型（如 GPT-4o）获得更可靠的操作体验。'
          : '⚠️ 本地模型未能正确生成操作指令。请尝试：\n1. 换一种更明确的方式描述需求\n2. 在设置中添加云端模型（OpenAI/Claude）以获得更可靠的操作体验\n3. 手动从左侧面板拖拽节点到画布上',
        tool_calls: [],
        usage: {},
        _fallback: true,
      };
    }

    return {
      content,
      tool_calls: toolCalls,
      usage: {},
    };
  }

  _buildPrompt(messages, tools) {
    let parts = '';
    for (const m of messages) {
      let content = m.content;
      if (m.role === 'system' && tools?.length > 0) {
        content += '\n\n可用工具（只有在用户要求操作时才调用，打招呼直接回复不要调用工具）：\n';
        for (const t of tools) {
          const fn = t.function || t;
          const params = fn.parameters?.properties ? Object.keys(fn.parameters.properties).join(', ') : '无参数';
          content += `- ${fn.name}：${fn.description}（参数：${params}）\n`;
        }
        content += '\n调用格式：\n<tool_call>{"name":"函数名","arguments":{...}}</tool_call>\n不要用其他格式。';
      }
      const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user';
      parts += `<|im_start|>${role}\n${content}<|im_end|>\n`;
    }
    parts += '<|im_start|>assistant\n';
    return parts;
  }

  _extractToolCalls(text) {
    const calls = [];

    // 格式 1：<tool_call>{...}</tool_call>
    const regexTag = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
    let match;
    while ((match = regexTag.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        calls.push(this._makeToolCall(parsed, calls.length));
      } catch { /* skip malformed */ }
    }

    // 格式 2：裸 JSON，格式为 {"name":"xxx","arguments":{...}}
    const regexBare = /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{/g;
    let match2;
    while ((match2 = regexBare.exec(text)) !== null) {
      try {
        // 找到匹配的闭合 }
        let depth = 0;
        let end = match2.index;
        do {
          if (text[end] === '{') depth++;
          if (text[end] === '}') depth--;
          end++;
        } while (depth > 0 && end < text.length);
        const jsonStr = text.slice(match2.index, end);
        const parsed = JSON.parse(jsonStr);
        // 避免重复已经通过格式 1 捕获的
        if (!calls.some(c => c.function?.name === parsed.name)) {
          calls.push(this._makeToolCall(parsed, calls.length));
        }
      } catch { /* skip malformed */ }
    }

    return calls;
  }

  _makeToolCall(parsed, index) {
    return {
      id: `call_${Date.now()}_${index}`,
      type: 'function',
      function: {
        name: parsed.name || parsed.function?.name,
        arguments: typeof parsed.arguments === 'string'
          ? parsed.arguments
          : JSON.stringify(parsed.arguments || {}),
      },
    };
  }

  _stripToolCalls(text) {
    let result = text.replace(/<tool_call>[\s\S]*?<\/tool_call>\n*/g, '').trim();
    // 去掉末尾的裸工具调用 JSON
    result = result.replace(/\n?\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*[\s\S]*?\}\s*$/g, '').trim();
    // 去掉任何残留的 <tool_call> 或 </tool_call> 标签
    result = result.replace(/<\/?tool_call>\s*/g, '').trim();
    // 去掉孤立的 JSON 块（模型可能输出了一半的工具调用）
    result = result.replace(/\n?\{\s*"name"\s*:\s*"[^"]*"\s*(?:,\s*"arguments"\s*:\s*\{[^}]*\})?\s*\}?\s*$/g, '').trim();
    return result;
  }

  /**
   * Detect if the model likely tried to call a tool but produced malformed output.
   * Returns a fallback hint if tool intent is detected but no valid calls parsed.
   */
  detectToolIntent(text) {
    const hasToolTag = /<tool_call/i.test(text);
    const hasToolJson = /\{\s*"name"\s*:\s*"[^"]+"/.test(text);
    const hasActionKeywords = /(?:添加|删除|运行|保存|清空|加载|导出|连接|更新|配置|add|delete|run|save|clear|load|export|connect|update|config)/i.test(text);
    return hasToolTag || hasToolJson || hasActionKeywords;
  }

  async embed(texts) {
    await this._ensureLoaded();
    const embeddingContext = await this._model.createEmbeddingContext();
    const results = [];
    for (const text of texts) {
      const emb = await embeddingContext.getEmbeddingFor(text);
      results.push(emb.vector);
    }
    return results;
  }

  async ping() {
    if (!fs.existsSync(this.modelPath)) return false;
    try {
      await import('node-llama-cpp');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Vision — not supported by the built-in GGUF model.
   * Returns a helpful error message pointing to cloud models.
   */
  async vision(_images, _prompt = '', _options = {}) {
    throw new Error(
      '内置本地模型不支持图像识别。请使用支持 Vision 的云端模型（如 GPT-4o、Claude 3、Ollama 的 llava/minicpm-v 等）。' +
      '\n在设置页面添加一个支持 Vision 的模型即可。'
    );
  }
}
