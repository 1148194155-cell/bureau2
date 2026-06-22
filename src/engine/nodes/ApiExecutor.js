/**
 * API 请求节点执行器。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import { registerNodeExecutor } from '../registry.js';

class ApiExecutor {
  async execute(node, inputData, ctx) {
    const { onLog, timeout } = ctx;
    const url = node.data?.config?.url || node.data?.url;
    const method = (node.data?.config?.method || node.data?.method || 'GET').toUpperCase();
    const apiHeaders = node.data?.config?.headers || node.data?.headers || {};
    const body = node.data?.config?.body || inputData;
    if (!url) throw new Error('API node missing url');

    const MAX_RESP = 5_000_000;
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...apiHeaders },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    const text = await resp.text();
    const safeText = text.length > MAX_RESP ? text.slice(0, MAX_RESP) : text;
    try { return JSON.parse(safeText); } catch { return { status: resp.status, body: safeText }; }
  }
}

registerNodeExecutor('api', new ApiExecutor());
registerNodeExecutor('api_caller', new ApiExecutor());
