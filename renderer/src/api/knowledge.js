/**
 * Knowledge base API module.
 */
import client from "./client";

export function fetchKnowledgeBases() {
  return client.get("/knowledge").then((r) => r.data.data || []);
}

export function createKnowledgeBase(payload) {
  return client.post("/knowledge", payload).then((r) => r.data.data);
}

export function indexKnowledgeBase(id, modelId) {
  return client.post(`/knowledge/${id}/index`, { model_id: modelId }).then((r) => r.data.data);
}

export function deleteKnowledgeBase(id) {
  return client.delete(`/knowledge/${id}`).then(() => undefined);
}
