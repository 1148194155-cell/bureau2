import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BaseModelAdapter,
  OllamaAdapter,
  OpenAIAdapter,
  LlamaCppAdapter,
  AnthropicAdapter,
  createAdapter,
  registerAdapter,
} from '../../src/models/adapter.js';

// ═══════════════════════════════════════════════════════════════════════════
// BaseModelAdapter
// ═══════════════════════════════════════════════════════════════════════════

describe('BaseModelAdapter', () => {
  it('constructs with config', () => {
    const adapter = new BaseModelAdapter({ name: 'test' });
    expect(adapter.name).toBe('test');
    expect(adapter.config).toEqual({ name: 'test' });
  });

  it('has default name when config has no name', () => {
    const adapter = new BaseModelAdapter({});
    expect(adapter.name).toBe('unknown');
  });

  it('chat() throws not implemented', async () => {
    const adapter = new BaseModelAdapter();
    await expect(adapter.chat([])).rejects.toThrow('chat() not implemented');
  });

  it('embed() throws not implemented', async () => {
    const adapter = new BaseModelAdapter();
    await expect(adapter.embed([])).rejects.toThrow('embed() not implemented');
  });

  it('ping() returns false', async () => {
    const adapter = new BaseModelAdapter();
    expect(await adapter.ping()).toBe(false);
  });

  it('vision() throws not implemented', async () => {
    const adapter = new BaseModelAdapter();
    await expect(adapter.vision([])).rejects.toThrow('vision() not implemented');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OllamaAdapter
// ═══════════════════════════════════════════════════════════════════════════

describe('OllamaAdapter', () => {
  it('constructs with defaults', () => {
    const adapter = new OllamaAdapter();
    expect(adapter.endpoint).toBe('http://localhost:11434');
    expect(adapter.model).toBe('llama3.2');
    expect(adapter).toBeInstanceOf(BaseModelAdapter);
  });

  it('constructs with custom config', () => {
    const adapter = new OllamaAdapter({
      name: 'my-ollama',
      endpoint: 'http://192.168.1.100:11434',
      model: 'mistral',
    });
    expect(adapter.name).toBe('my-ollama');
    expect(adapter.endpoint).toBe('http://192.168.1.100:11434');
    expect(adapter.model).toBe('mistral');
  });

  it('strips trailing slash from endpoint', () => {
    const adapter = new OllamaAdapter({ endpoint: 'http://localhost:11434/' });
    expect(adapter.endpoint).toBe('http://localhost:11434');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OpenAIAdapter
// ═══════════════════════════════════════════════════════════════════════════

describe('OpenAIAdapter', () => {
  it('constructs with defaults', () => {
    const adapter = new OpenAIAdapter();
    expect(adapter.endpoint).toBe('https://api.openai.com/v1');
    expect(adapter.model).toBe('gpt-4o-mini');
    expect(adapter.apiKey).toBe('');
    expect(adapter).toBeInstanceOf(BaseModelAdapter);
  });

  it('constructs with custom config', () => {
    const adapter = new OpenAIAdapter({
      name: 'my-openai',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4',
      apiKey: 'sk-test',
    });
    expect(adapter.name).toBe('my-openai');
    expect(adapter.model).toBe('gpt-4');
    expect(adapter.apiKey).toBe('sk-test');
  });

  it('strips trailing slash from endpoint', () => {
    const adapter = new OpenAIAdapter({ endpoint: 'https://api.openai.com/v1/' });
    expect(adapter.endpoint).toBe('https://api.openai.com/v1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LlamaCppAdapter
// ═══════════════════════════════════════════════════════════════════════════

describe('LlamaCppAdapter', () => {
  it('constructs with defaults', () => {
    const adapter = new LlamaCppAdapter();
    expect(adapter.endpoint).toBe('http://localhost:8080');
    expect(adapter.model).toBe('default');
  });

  it('constructs with custom config', () => {
    const adapter = new LlamaCppAdapter({
      name: 'local-llama',
      endpoint: 'http://localhost:8081',
      model: 'codellama',
    });
    expect(adapter.name).toBe('local-llama');
    expect(adapter.model).toBe('codellama');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AnthropicAdapter
// ═══════════════════════════════════════════════════════════════════════════

describe('AnthropicAdapter', () => {
  it('constructs with defaults', () => {
    const adapter = new AnthropicAdapter();
    expect(adapter.model).toBe('claude-sonnet-4-20250514');
    expect(adapter.baseUrl).toBe('https://api.anthropic.com/v1');
    expect(adapter.apiKey).toBe('');
  });

  it('constructs with custom config', () => {
    const adapter = new AnthropicAdapter({
      name: 'claude',
      model: 'claude-opus-4-20250514',
      apiKey: 'sk-ant-test',
      endpoint: 'https://api.anthropic.com',
    });
    expect(adapter.name).toBe('claude');
    expect(adapter.model).toBe('claude-opus-4-20250514');
    expect(adapter.apiKey).toBe('sk-ant-test');
    expect(adapter.baseUrl).toBe('https://api.anthropic.com');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// createAdapter (factory)
// ═══════════════════════════════════════════════════════════════════════════

describe('createAdapter', () => {
  it('creates an OllamaAdapter from model record', () => {
    const model = {
      id: 1,
      name: 'local-llama',
      adapter_type: 'ollama',
      config: JSON.stringify({ endpoint: 'http://localhost:11434', model: 'llama3.2' }),
    };
    const adapter = createAdapter(model);
    expect(adapter).toBeInstanceOf(OllamaAdapter);
    expect(adapter.name).toBe('local-llama');
    expect(adapter.model).toBe('llama3.2');
  });

  it('creates an OpenAIAdapter', () => {
    const model = {
      id: 2,
      name: 'gpt',
      adapter_type: 'openai',
      config: { model: 'gpt-4', apiKey: 'sk-plain' },
    };
    const adapter = createAdapter(model);
    expect(adapter).toBeInstanceOf(OpenAIAdapter);
    expect(adapter.model).toBe('gpt-4');
  });

  it('creates a LlamaCppAdapter', () => {
    const model = {
      id: 3,
      name: 'cpp',
      adapter_type: 'llamacpp',
      config: {},
    };
    const adapter = createAdapter(model);
    expect(adapter).toBeInstanceOf(LlamaCppAdapter);
  });

  it('creates an AnthropicAdapter', () => {
    const model = {
      id: 4,
      name: 'claude',
      adapter_type: 'anthropic',
      config: { model: 'claude-sonnet-4-20250514', apiKey: 'sk-test' },
    };
    const adapter = createAdapter(model);
    expect(adapter).toBeInstanceOf(AnthropicAdapter);
  });

  it('throws for unknown adapter type', () => {
    const model = {
      id: 5,
      name: 'unknown',
      adapter_type: 'magic',
      config: {},
    };
    expect(() => createAdapter(model)).toThrow('Unknown adapter type: magic');
  });

  it('handles config as a JSON string', () => {
    const model = {
      id: 6,
      name: 'test',
      adapter_type: 'ollama',
      config: '{"model":"test-model"}',
    };
    const adapter = createAdapter(model);
    expect(adapter.model).toBe('test-model');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// registerAdapter
// ═══════════════════════════════════════════════════════════════════════════

describe('registerAdapter', () => {
  it('registers a valid adapter class', () => {
    class CustomAdapter extends BaseModelAdapter {
      async chat(messages) { return { content: 'custom' }; }
    }

    registerAdapter('custom-test', CustomAdapter);

    const model = {
      id: 99,
      name: 'custom',
      adapter_type: 'custom-test',
      config: {},
    };
    const adapter = createAdapter(model);
    expect(adapter).toBeInstanceOf(CustomAdapter);
  });

  it('throws when registering a non-BaseModelAdapter class', () => {
    class NotAnAdapter {}
    expect(() => registerAdapter('bad', NotAnAdapter)).toThrow(
      'Adapter must be a class extending BaseModelAdapter'
    );
  });

  it('throws when registering a plain function', () => {
    expect(() => registerAdapter('fn', function() {})).toThrow(
      'Adapter must be a class extending BaseModelAdapter'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mocked network tests — cover chat/ping/embed/vision without real servers
// ═══════════════════════════════════════════════════════════════════════════

describe('OllamaAdapter (mocked fetch)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('chat() sends correct request and returns content', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: 'Hello from Ollama' },
      }),
    });

    const adapter = new OllamaAdapter({ model: 'llama3.2' });
    const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);

    expect(result.content).toBe('Hello from Ollama');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('llama3.2');
    expect(body.messages).toHaveLength(1);
    expect(body.stream).toBe(false);
  });

  it('chat() includes tools when provided', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: '', tool_calls: [] } }),
    });

    const adapter = new OllamaAdapter();
    const tools = [{ type: 'function', function: { name: 'calc' } }];
    await adapter.chat([{ role: 'user', content: '1+1' }], { tools });

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.tools).toEqual(tools);
  });

  it('chat() throws on non-ok response', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const adapter = new OllamaAdapter();
    await expect(adapter.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Ollama API error 500');
  });

  it('chat() respects timeout option', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'ok' } }),
    });

    const adapter = new OllamaAdapter();
    await adapter.chat([], { timeout: 30000 });

    const opts = globalThis.fetch.mock.calls[0][1];
    expect(opts.signal).toBeDefined();
  });

  it('embed() sends correct request', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
    });

    const adapter = new OllamaAdapter();
    const result = await adapter.embed(['test text']);
    expect(result).toEqual([[0.1, 0.2, 0.3]]);
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embed');
  });

  it('embed() throws on error', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 400 });
    const adapter = new OllamaAdapter();
    await expect(adapter.embed(['text'])).rejects.toThrow('Ollama embed error 400');
  });

  it('ping() returns true on success', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true });
    const adapter = new OllamaAdapter();
    expect(await adapter.ping()).toBe(true);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
  });

  it('ping() returns false on failure', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('Connection refused'));
    const adapter = new OllamaAdapter();
    expect(await adapter.ping()).toBe(false);
  });

  it('vision() sends multimodal request', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'A cat on a mat' } }),
    });

    const adapter = new OllamaAdapter({ model: 'llava' });
    const result = await adapter.vision(['data:image/png;base64,abc123'], 'What do you see?');

    expect(result.content).toBe('A cat on a mat');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.model).toBe('llava');
    expect(body.messages[0].images).toContain('data:image/png;base64,abc123');
  });

  it('vision() throws on error', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Bad request' });
    const adapter = new OllamaAdapter();
    await expect(adapter.vision(['img'])).rejects.toThrow('Ollama vision error 400');
  });
});

describe('OpenAIAdapter (mocked fetch)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('chat() sends correct request', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'GPT response' } }],
        usage: { total_tokens: 10 },
      }),
    });

    const adapter = new OpenAIAdapter({ model: 'gpt-4', apiKey: 'sk-test' });
    const result = await adapter.chat([{ role: 'user', content: 'Hello' }]);

    expect(result.content).toBe('GPT response');
    expect(result.usage.total_tokens).toBe(10);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('gpt-4');
  });

  it('chat() includes tools', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '', tool_calls: [] } }] }),
    });

    const adapter = new OpenAIAdapter({ apiKey: 'sk' });
    await adapter.chat([], { tools: [{ name: 'tool1' }], tool_choice: 'auto' });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.tools).toBeDefined();
    expect(body.tool_choice).toBe('auto');
  });

  it('chat() throws on error', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
    const adapter = new OpenAIAdapter({ apiKey: 'bad' });
    await expect(adapter.chat([])).rejects.toThrow('OpenAI API error 401');
  });

  it('embed() sends correct request', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
    });

    const adapter = new OpenAIAdapter({ apiKey: 'sk' });
    const result = await adapter.embed(['hello']);
    expect(result).toEqual([[0.1, 0.2]]);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(opts.headers.Authorization).toBe('Bearer sk');
  });

  it('embed() throws on error', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const adapter = new OpenAIAdapter({ apiKey: 'sk' });
    await expect(adapter.embed(['x'])).rejects.toThrow('OpenAI embed error 500');
  });

  it('ping() returns true on success', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true });
    const adapter = new OpenAIAdapter({ apiKey: 'sk' });
    expect(await adapter.ping()).toBe(true);
  });

  it('ping() returns false on error', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('Network error'));
    const adapter = new OpenAIAdapter({ apiKey: 'sk' });
    expect(await adapter.ping()).toBe(false);
  });
});

describe('LlamaCppAdapter (mocked fetch)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('chat() formats prompt correctly', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: 'response' }),
    });

    const adapter = new LlamaCppAdapter({ endpoint: 'http://localhost:8080' });
    const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);

    expect(result.content).toBe('response');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.prompt).toContain('<|im_start|>user');
    expect(body.prompt).toContain('Hi');
    expect(body.stop).toContain('<|im_end|>');
  });

  it('chat() throws on error', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const adapter = new LlamaCppAdapter();
    await expect(adapter.chat([])).rejects.toThrow('llama.cpp API error 503');
  });

  it('ping() returns true on success', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true });
    expect(await new LlamaCppAdapter().ping()).toBe(true);
  });

  it('ping() returns false on error', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await new LlamaCppAdapter().ping()).toBe(false);
  });

  it('embed() returns embeddings array', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2] }),
    });

    const adapter = new LlamaCppAdapter();
    const result = await adapter.embed(['hello']);
    expect(result).toEqual([[0.1, 0.2]]);
  });

  it('embed() handles individual failures gracefully', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1] }),
      })
      .mockRejectedValueOnce(new Error('timeout'));

    const adapter = new LlamaCppAdapter();
    const result = await adapter.embed(['text1', 'text2']);
    expect(result).toEqual([[0.1], null]);
  });

  it('embed() handles non-ok response as null', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const adapter = new LlamaCppAdapter();
    const result = await adapter.embed(['text']);
    expect(result).toEqual([null]);
  });
});

describe('AnthropicAdapter (mocked fetch)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('chat() sends correct request with system message', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Claude response' }],
        usage: { input_tokens: 5, output_tokens: 10 },
      }),
    });

    const adapter = new AnthropicAdapter({ apiKey: 'sk-ant-test', model: 'claude-sonnet' });
    const result = await adapter.chat([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);

    expect(result.content).toBe('Claude response');
    expect(result.usage.input_tokens).toBe(5);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('sk-ant-test');
    const body = JSON.parse(opts.body);
    expect(body.system).toBeDefined();
    expect(body.messages).toHaveLength(1); // system filtered out
  });

  it('chat() sends tools correctly in request', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    const adapter = new AnthropicAdapter({ apiKey: 'sk' });
    await adapter.chat(
      [{ role: 'user', content: 'test' }],
      { tools: [{ function: { name: 'test_tool', description: 'desc', parameters: {} } }] }
    );

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.tools).toBeDefined();
    expect(body.tools[0].name).toBe('test_tool');
    expect(body.tools[0].input_schema).toBeDefined();
  });

  it('chat() omits temperature when null', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    const adapter = new AnthropicAdapter({ apiKey: 'sk' });
    await adapter.chat([{ role: 'user', content: 'test' }], { temperature: null });

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.temperature).toBeUndefined();
  });
  it('chat() handles tool_use in response', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'tool_1', name: 'search', input: { query: 'weather' } },
        ],
      }),
    });

    const adapter = new AnthropicAdapter({ apiKey: 'sk' });
    const result = await adapter.chat([{ role: 'user', content: 'What is the weather?' }]);

    expect(result.content).toBe('Let me check.');
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0].function.name).toBe('search');
  });

  it('chat() throws on error', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' });
    const adapter = new AnthropicAdapter({ apiKey: 'bad' });
    await expect(adapter.chat([])).rejects.toThrow('Anthropic API error 403');
  });

  it('ping() returns true on success', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true });
    expect(await new AnthropicAdapter({ apiKey: 'sk' }).ping()).toBe(true);
  });

  it('ping() returns false on error', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('timeout'));
    expect(await new AnthropicAdapter({ apiKey: 'sk' }).ping()).toBe(false);
  });
});
