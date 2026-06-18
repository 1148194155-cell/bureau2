/**
 * Execution API module + WebSocket helper.
 */
import client from "./client";

export function getExecutionStatus(executionId) {
  return client.get(`/executions/${executionId}/status`).then((r) => r.data.data);
}

export function cancelExecution(executionId) {
  return client.post(`/executions/${executionId}/cancel`).then((r) => r.data.data);
}

export function stepExecution(executionId, action) {
  return client.post(`/executions/${executionId}/step`, { action }).then((r) => r.data.data);
}

export function listExecutionHistory(workflowId, limit = 20) {
  return client.get(`/executions/history/${workflowId}`, { params: { limit } }).then((r) => r.data.data);
}

export function compareExecutions(execIdA, execIdB) {
  return client
    .post("/executions/compare", {
      execution_id_a: execIdA,
      execution_id_b: execIdB,
    })
    .then((r) => r.data.data);
}

// ── WebSocket ──

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create a WebSocket connection for real-time execution logs.
 * Auto-reconnects with exponential backoff.
 */
export function createExecutionSocket(executionId) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  let ws = null;
  let retries = 0;
  const MAX_RETRIES = 5;

  function connect() {
    const prevOnMessage = ws?.onmessage;
    const prevOnError = ws?.onerror;
    const prevOnClose = ws?.onclose;
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.onclose = null;
      ws.close();
    }
    ws = new WebSocket(`${protocol}//${host}/ws`);
    if (prevOnMessage) ws.onmessage = prevOnMessage;
    if (prevOnError) ws.onerror = prevOnError;
    if (prevOnClose) ws.onclose = prevOnClose;

    ws.onopen = () => {
      retries = 0;
      ws.send(
        JSON.stringify({ type: "subscribe", execution_id: executionId })
      );
    };

    ws.onclose = async () => {
      if (retries >= MAX_RETRIES) return;
      retries++;
      await sleep(Math.min(1000 * Math.pow(2, retries), 10000));
      connect();
    };
  }

  connect();

  const proxy = {
    set onmessage(fn) {
      const setter = () => {
        ws.onmessage = fn;
      };
      if (ws.readyState === WebSocket.OPEN) setter();
      else ws.addEventListener("open", setter, { once: true });
    },
    set onerror(fn) {
      const setter = () => {
        ws.onerror = fn;
      };
      if (ws.readyState === WebSocket.OPEN) setter();
      else ws.addEventListener("open", setter, { once: true });
    },
    set onclose(fn) {
      const setter = () => {
        ws.onclose = fn;
      };
      if (ws.readyState === WebSocket.OPEN) setter();
      else ws.addEventListener("open", setter, { once: true });
    },
    close() {
      ws.close();
    },
  };

  // Pull historical logs on reconnect via REST
  ws.addEventListener(
    "open",
    async () => {
      try {
        const status = await getExecutionStatus(executionId);
        if (status?.logs) {
          for (const log of status.logs) {
            proxy.onmessage?.({
              data: JSON.stringify({ type: "log", data: log }),
            });
          }
        }
        if (status?.status === "completed" || status?.status === "failed") {
          proxy.onmessage?.(
            JSON.stringify({
              type: status.status === "completed" ? "complete" : "error",
              error: status.error,
            })
          );
        }
      } catch {
        /* non-critical */
      }
    },
    { once: true }
  );

  return proxy;
}
