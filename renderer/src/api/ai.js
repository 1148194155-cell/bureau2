/**
 * AI Chat API module.
 */
import client from "./client";

export function aiChat({ message, history, canvas_state, model_id, lang }, signal) {
  return client
    .post(
      "/ai/chat",
      { message, history, canvas_state, model_id, lang },
      { timeout: 180000, signal }
    )
    .then((r) => r.data.data);
}

export function getBuiltinStatus() {
  return client.get("/builtin/status").then((r) => r.data.data);
}
