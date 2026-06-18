/**
 * Model API module.
 */
import client from "./client";

export function fetchModels() {
  return client.get("/models").then((r) => r.data.data || []);
}

export function createModel(payload) {
  return client.post("/models", payload).then((r) => r.data.data);
}

export function deleteModel(id) {
  return client.delete(`/models/${id}`).then(() => undefined);
}
