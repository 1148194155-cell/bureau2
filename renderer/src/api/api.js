import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
  headers: { "Content-Type": "application/json", "X-User-Id": "1" },
});

// --- Skills ---
export async function fetchSkills() {
  const { data } = await api.get("/skills");
  return data.data || [];
}

// --- Models ---
export async function fetchModels() {
  const { data } = await api.get("/models");
  return data.data || [];
}

export async function createModel(payload) {
  const { data } = await api.post("/models", payload);
  return data.data;
}

export async function deleteModel(id) {
  await api.delete(`/models/${id}`);
}

// --- APIs ---
export async function fetchApis() {
  const { data } = await api.get("/apis");
  return data.data || [];
}

export async function createApi(payload) {
  const { data } = await api.post("/apis", payload);
  return data.data;
}

export async function deleteApi(id) {
  await api.delete(`/apis/${id}`);
}

// --- Knowledge Bases ---
export async function fetchKnowledgeBases() {
  const { data } = await api.get("/knowledge");
  return data.data || [];
}

export async function createKnowledgeBase(payload) {
  const { data } = await api.post("/knowledge", payload);
  return data.data;
}

export async function indexKnowledgeBase(id, modelId) {
  const { data } = await api.post(`/knowledge/${id}/index`, { model_id: modelId });
  return data.data;
}

export async function deleteKnowledgeBase(id) {
  await api.delete(`/knowledge/${id}`);
}

// --- API Keys ---
export async function fetchApiKeys() {
  const { data } = await api.get("/apikeys");
  return data.data || [];
}

export async function createApiKey(payload) {
  const { data } = await api.post("/apikeys", payload);
  return data.data;
}

export async function deleteApiKey(id) {
  await api.delete(`/apikeys/${id}`);
}

// --- Workflows ---
export async function saveWorkflow(name, nodes, edges, id = null) {
  if (id) {
    await api.put(`/workflows/${id}`, { name, nodes, edges });
    return { id };
  }
  const { data } = await api.post("/workflows", { name, nodes, edges });
  return data.data;
}

export async function listWorkflows() {
  const { data } = await api.get("/workflows");
  return data.data || [];
}

export async function loadWorkflow(id) {
  const { data } = await api.get(`/workflows/${id}`);
  return data.data;
}

export async function runWorkflow({ workflow_id, nodes, edges, options }) {
  const { data } = await api.post("/workflows/run", { workflow_id, nodes, edges, options });
  return data.data;
}

export async function getExecutionStatus(executionId) {
  const { data } = await api.get(`/executions/${executionId}/status`);
  return data.data;
}

// --- AI Chat ---
export async function aiChat({ message, history, canvas_state, model_id, lang }, signal) {
  const { data } = await api.post("/ai/chat",
    { message, history, canvas_state, model_id, lang },
    { timeout: 180000, signal }   // builtin: first-load 30-40s + inference
  );
  return data.data;
}

// --- Built-in Model ---
export async function getBuiltinStatus() {
  const { data } = await api.get("/builtin/status");
  return data.data;
}

// --- WebSocket ---
export function createExecutionSocket(executionId) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const ws = new WebSocket(`${protocol}//${host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "subscribe", execution_id: executionId }));
  };

  return ws;
}

export default api;

