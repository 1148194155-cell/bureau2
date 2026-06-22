/**
 * AI Chat API module.
 */
import client from "./client";

export function aiChat({ message, history, canvas_state, model_id, lang }, signal) {
  return client
    .post(
      "/ai/chat",
      { message, history, canvas_state, model_id, lang },
      { timeout: 60000, signal }
    )
    .then((r) => r.data.data);
}

export function aiChatStream({ message, history, canvas_state, model_id, lang }, signal) {
  const timeoutId = setTimeout(() => {
    if (signal && !signal.aborted) {
      signal.removeEventListener('abort', onUserAbort);
    }
  }, 60000);

  const onUserAbort = () => {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onUserAbort);
  };

  if (signal) signal.addEventListener('abort', onUserAbort);

  return client
    .post(
      "/ai/chat",
      { message, history, canvas_state, model_id, lang },
      { timeout: 60000, signal }
    )
    .then((r) => r.data.data)
    .finally(() => {
      clearTimeout(timeoutId);
      if (signal) { signal.removeEventListener('abort', onUserAbort); }
    });
}

export function getBuiltinStatus() {
  return client.get("/builtin/status").then((r) => r.data.data);
}
