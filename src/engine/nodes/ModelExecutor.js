/**
 * Model / LLM / AI 节点执行器。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import { registerNodeExecutor } from '../registry.js';

class ModelExecutor {
  async execute(node, inputData, ctx) {
    const { adapters, onLog, timeout } = ctx;
    const modelId = node.data?.modelId || node.data?.model_id || node.data?.config?.modelId;
    const adapter = adapters[modelId];

    if (!adapter) {
      // Fallback: try first available adapter
      const first = Object.values(adapters).find(a => a && typeof a.chat === 'function');
      if (!first) throw new Error(`No AI model adapter available. Add a model first.`);
      return this.callModel(first, node, inputData, onLog, timeout);
    }
    return this.callModel(adapter, node, inputData, onLog, timeout);
  }

  async callModel(adapter, node, inputData, onLog, timeout) {
    const promptTemplate = node.data?.config?.prompt || node.data?.prompt || '';
    const temperature = node.data?.config?.temperature ?? 0.7;
    const maxTokens = node.data?.config?.max_tokens ?? 2048;

    // Render template with input data
    const prompt = promptTemplate ? renderTemplate(promptTemplate, inputData) : JSON.stringify(inputData);
    onLog('debug', `Model prompt: ${prompt.slice(0, 200)}...`);

    const messages = [
      { role: 'system', content: node.data?.config?.systemPrompt || 'You are a helpful assistant.' },
      { role: 'user', content: prompt },
    ];

    const result = await adapter.chat(messages, {
      temperature,
      max_tokens: maxTokens,
      timeout,
    });
    return safeParseJson(result.content);
  }
}

function renderTemplate(tmpl, data) {
  return tmpl.replace(/\{\{\s*(\S+?)\s*\}\}/g, (_, key) => {
    const val = getNestedValue(data, key);
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

function getNestedValue(obj, path) {
  if (!path || typeof path !== 'string') return obj;
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return { output: str };
  }
}

registerNodeExecutor('model', new ModelExecutor());
registerNodeExecutor('llm', new ModelExecutor());
registerNodeExecutor('ai', new ModelExecutor());
