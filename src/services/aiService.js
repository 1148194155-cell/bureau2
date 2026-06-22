/**
 * AI Chat Service — LLM 对话处理，适配器选择，超时控制。
 * @since 2025-01 阶段2：从 ai route 提取。
 */
import { getDb } from '../db.js';
import { ValidationError, TimeoutError, ExecutionError } from '../errors.js';
import { createAdapter } from '../models/adapter.js';
import { DEFAULT_MODEL_PATH } from '../models/builtinAdapter.js';
import { handleChatMessage } from '../ai/chatHandler.js';
import { createLogger } from '../logger.js';
import fs from 'fs-extra';

const log = createLogger('ai');

export class AiService {
  async chat(userId, { message, history, canvas_state, model_id, lang }) {
    if (!message) {
      throw new ValidationError('message is required');
    }

    const db = getDb();
    const modelId = model_id || 'builtin';
    let model;
    let timeoutMs = 30000;

    if (modelId === 'builtin') {
      const available = fs.existsSync(DEFAULT_MODEL_PATH);
      if (!available) {
        // Fallback: use the first available user model instead
        model = db.prepare("SELECT * FROM models WHERE user_id = ? LIMIT 1").get(userId);
        if (!model) {
          throw new ValidationError('内置模型不可用，且没有配置其他模型。请先添加一个模型（Ollama / OpenAI / Anthropic）');
        }
      } else {
        model = { id: 'builtin', name: '内置模型 (本地)', adapter_type: 'builtin', config: {} };
        timeoutMs = 120000;
      }
    } else {
      model = db.prepare('SELECT * FROM models WHERE id = ? AND user_id = ?').get(modelId, userId);
      if (!model) {
        throw new ValidationError('Model not found. Add a model first.');
      }
    }

    const adapter = createAdapter(model);
    try {
      return await Promise.race([
        handleChatMessage({
          message,
          history: history || [],
          canvasState: canvas_state || { nodes: [], edges: [] },
          adapter,
          userId,
          db: getDb(),
          lang: lang || 'zh',
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
        ),
      ]);
    } catch (err) {
      const errMsg = err.message || String(err);
      if (errMsg.includes('timed out')) {
        throw new TimeoutError(`模型响应超时(${Math.round(timeoutMs / 1000)}s)，请检查模型是否正常运行`);
      }
      if (errMsg.includes('out of memory') || errMsg.includes('OOM')) {
        throw new ExecutionError('模型加载内存不足，请关闭其他应用或使用更小的模型');
      }
      if (errMsg.includes('unsupported') || errMsg.includes('architecture')) {
        throw new ExecutionError('模型格式不支持，请下载 Qwen2.5-3B-Instruct-Q4_K_M.gguf 格式的模型文件');
      }
      throw new ExecutionError(`模型运行时错误: ${errMsg}`);
    }
  }
}

export const aiService = new AiService();
