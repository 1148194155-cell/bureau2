/**
 * API Keys module.
 */
import client from "./client";

export function fetchApiKeys() {
  return client.get("/apikeys").then((r) => r.data.data || []);
}

export function createApiKey(payload) {
  return client.post("/apikeys", payload).then((r) => r.data.data);
}

export function deleteApiKey(id) {
  return client.delete(`/apikeys/${id}`).then(() => undefined);
}
