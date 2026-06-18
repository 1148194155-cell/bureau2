/**
 * Workflow API module.
 */
import client from "./client";

export function listWorkflows() {
  return client.get("/workflows").then((r) => r.data.data);
}

export function getWorkflow(id) {
  return client.get(`/workflows/${id}`).then((r) => r.data.data);
}

export function saveWorkflow(name, nodes, edges, id = null) {
  if (id) {
    return client.put(`/workflows/${id}`, { name, nodes, edges }).then(() => ({ id }));
  }
  return client.post("/workflows", { name, nodes, edges }).then((r) => r.data.data);
}

export function deleteWorkflow(id) {
  return client.delete(`/workflows/${id}`).then((r) => r.data);
}

export function runWorkflow({ workflow_id, nodes, edges, options }) {
  return client.post("/workflows/run", { workflow_id, nodes, edges, options }).then((r) => r.data.data);
}

export function loadWorkflow(id) {
  return getWorkflow(id);
}
