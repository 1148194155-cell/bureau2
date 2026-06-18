/**
 * Base model adapter — all adapters extend this class.
 */
import { decrypt } from '../crypto.js';

export class BaseModelAdapter {
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'unknown';
  }

  /**
   * Send a chat completion request.
   * @param {Array<{role:string,content:string}>} messages
   * @param {object} options - temperature, max_tokens, stream, tools, etc.
   * @returns {Promise<{content:string, usage?:object}>}
   */
  async chat(messages, options = {}) {
    throw new Error('chat() not implemented by this adapter');
  }

  /**
   * Generate embeddings for a list of texts.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embed(texts) {
    throw new Error('embed() not implemented by this adapter');
  }

  /**
   * Check if the adapter/model is reachable.
   * @returns {Promise<boolean>}
   */
  async ping() {
    return false;
  }

  /**
   * Vision / multimodal — analyze an image with an optional text prompt.
   * @param {Array<{type:string, source?:object, text?:string}>|string[]} images - Base64 data URLs or file paths
   * @param {string} [prompt] - Optional text instruction
   * @param {object} [options] - Additional options
   * @returns {Promise<{content:string, usage?:object}>}
   */
  async vision(images, prompt = '', options = {}) {
    throw new Error('vision() not implemented by this adapter');
  }
}

// ── Ollama Adapter ──────────────────────────────────────────────────────────

export class OllamaAdapter extends BaseModelAdapter {
  constructor(config = {}) {
    super(config);
    this.endpoint = (config.endpoint || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.model || 'llama3.2';
  }

  async chat(messages, options = {}) {
    // For chat we use the /api/chat endpoint
    const body = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        ...(options.max_tokens ? { num_predict: options.max_tokens } : {}),
      },
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout ?? 60000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return {
      content: data.message?.content || '',
      tool_calls: data.message?.tool_calls || [],
      usage: { total_tokens: data.total_duration ? Math.round(data.total_duration / 1e9) : 0 },
    };
  }

  async embed(texts) {
    const res = await fetch(`${this.endpoint}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Ollama embed error ${res.status}`);
    const data = await res.json();
    return data.embeddings || [];
  }

  async ping() {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async vision(images, prompt = '', options = {}) {
    // Ollama supports vision via chat with base64 images
    const imageContents = images.map(img => {
      const base64 = typeof img === 'string' && !img.startsWith('data:')
        ? img  // assume already base64
        : img;
      return { type: 'image_url', image_url: { url: base64 } };
    });

    const messages = [{
      role: 'user',
      content: prompt || 'Describe this image in detail.',
      images: imageContents.map(i => i.image_url.url),
    }];

    const body = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.5,
        ...(options.max_tokens ? { num_predict: options.max_tokens } : {}),
      },
    };

    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout ?? 120000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama vision error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return { content: data.message?.content || '', usage: {} };
  }
}

// ── OpenAI Adapter ──────────────────────────────────────────────────────────

export class OpenAIAdapter extends BaseModelAdapter {
  constructor(config = {}) {
    super(config);
    this.endpoint = (config.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = config.model || 'gpt-4o-mini';
    this.apiKey = config.apiKey || '';
  }

  async chat(messages, options = {}) {
    const body = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.tool_choice || 'auto';
    }

    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout ?? 60000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      tool_calls: choice?.message?.tool_calls || [],
      usage: data.usage || {},
    };
  }

  async embed(texts) {
    const res = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`OpenAI embed error ${res.status}`);
    const data = await res.json();
    return data.data?.map(item => item.embedding) || [];
  }

  async ping() {
    try {
      const res = await fetch(`${this.endpoint}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async vision(images, prompt = '', options = {}) {
    // OpenAI Vision API — images can be base64 data URLs or file paths (read as base64)
    const fs = await import('fs-extra');
    const imageContents = await Promise.all(images.map(async (img) => {
      let url;
      if (typeof img === 'string') {
        if (img.startsWith('data:image/')) {
          url = img;
        } else if (img.startsWith('/') || /^[A-Z]:/i.test(img)) {
          // File path — read and convert to base64 data URL
          const buf = await fs.default.readFile(img);
          const ext = img.split('.').pop()?.toLowerCase() || 'png';
          const mime = ext === 'jpg' ? 'jpeg' : ext;
          url = `data:image/${mime};base64,${buf.toString('base64')}`;
        } else {
          url = img; // assume already base64
        }
      } else {
        url = String(img);
      }
      return { type: 'image_url', image_url: { url, detail: options.detail || 'auto' } };
    }));

    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: prompt || 'Describe this image in detail.' },
        ...imageContents,
      ],
    }];

    const body = {
      model: this.model,
      messages,
      max_tokens: options.max_tokens ?? 1024,
      temperature: options.temperature ?? 0.5,
    };

    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout ?? 120000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI vision error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage,
    };
  }
}

// ── llama.cpp Adapter ───────────────────────────────────────────────────────

export class LlamaCppAdapter extends BaseModelAdapter {
  constructor(config = {}) {
    super(config);
    this.endpoint = (config.endpoint || 'http://localhost:8080').replace(/\/+$/, '');
    this.model = config.model || 'default';
  }

  async chat(messages, options = {}) {
    // llama.cpp server uses /completion endpoint with prompt-style input
    const prompt = messages.map(m => {
      if (m.role === 'system') return `<|im_start|>system\n${m.content}<|im_end|>\n`;
      if (m.role === 'user') return `<|im_start|>user\n${m.content}<|im_end|>\n`;
      if (m.role === 'assistant') return `<|im_start|>assistant\n${m.content}<|im_end|>\n`;
      return `${m.content}\n`;
    }).join('') + '<|im_start|>assistant\n';

    const body = {
      prompt,
      n_predict: options.max_tokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      stop: ['<|im_end|>', '</s>'],
    };

    const res = await fetch(`${this.endpoint}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout ?? 120000),
    });

    if (!res.ok) throw new Error(`llama.cpp API error ${res.status}`);
    const data = await res.json();

    return {
      content: data.content || '',
      usage: { total_tokens: data.tokens_predicted || 0 },
    };
  }

  async embed(texts) {
    const results = [];
    for (const text of texts) {
      try {
        const res = await fetch(`${this.endpoint}/embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text || ' ' }),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`llama.cpp embed error ${res.status}`);
        const data = await res.json();
        results.push(data.embedding || []);
      } catch {
        results.push(null);
      }
    }
    return results;
  }

  async ping() {
    try {
      const res = await fetch(this.endpoint, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ── Anthropic Adapter ───────────────────────────────────────────────────────

export class AnthropicAdapter extends BaseModelAdapter {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.baseUrl = (config.endpoint || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  }

  async chat(messages, options = {}) {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const body = {
      model: this.model,
      max_tokens: options.max_tokens ?? 4096,
      messages: nonSystemMessages.map(m => ({ role: m.role, content: m.content })),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map(m => ({ type: 'text', text: m.content }));
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        name: t.function?.name,
        description: t.function?.description,
        input_schema: t.function?.parameters,
      }));
    }

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout ?? 120000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${errText}`);
    }

    const data = await res.json();

    return {
      content: data.content?.[0]?.text || '',
      tool_calls: (data.content || [])
        .filter(c => c.type === 'tool_use')
        .map(c => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input) },
        })),
      usage: {
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
      },
    };
  }

  async embed(texts) {
    throw new Error('Anthropic does not support embeddings via this adapter');
  }

  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ── Adapter Factory ─────────────────────────────────────────────────────────

const ADAPTER_MAP = {
  ollama: OllamaAdapter,
  openai: OpenAIAdapter,
  llamacpp: LlamaCppAdapter,
  anthropic: AnthropicAdapter,
};

/**
 * Create an adapter instance from a model record.
 * @param {object} model - { id, name, adapter_type, config }
 * @returns {BaseModelAdapter}
 */
export function createAdapter(model) {
  const AdapterClass = ADAPTER_MAP[model.adapter_type];
  if (!AdapterClass) {
    throw new Error(`Unknown adapter type: ${model.adapter_type}`);
  }

  const config = typeof model.config === 'string' ? JSON.parse(model.config) : model.config;

  // Decrypt apiKey if it was stored encrypted
  if (config.apiKey && config.apiKey.includes(':')) {
    try {
      config.apiKey = decrypt(config.apiKey);
    } catch {
      throw new Error(`API Key 解密失败，请重新配置模型 "${model.name}" 的 Key`);
    }
  }

  return new AdapterClass({ ...config, name: model.name });
}

/**
 * Register a custom adapter class at runtime.
 * @param {string} type - Adapter type key (e.g. 'lmstudio')
 * @param {typeof BaseModelAdapter} adapterClass
 */
export function registerAdapter(type, adapterClass) {
  if (typeof adapterClass !== 'function' || !(adapterClass.prototype instanceof BaseModelAdapter)) {
    throw new Error('Adapter must be a class extending BaseModelAdapter');
  }
  ADAPTER_MAP[type] = adapterClass;
}

export default {
  BaseModelAdapter,
  OllamaAdapter,
  OpenAIAdapter,
  LlamaCppAdapter,
  AnthropicAdapter,
  createAdapter,
  registerAdapter,
};
