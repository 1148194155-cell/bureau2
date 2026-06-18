/**
 * Manual API endpoints module.
 */
import client from "./client";

export function fetchApis() {
  return client.get("/apis").then((r) => r.data.data || []);
}

export function createApi(payload) {
  return client.post("/apis", payload).then((r) => r.data.data);
}

export function deleteApi(id) {
  return client.delete(`/apis/${id}`).then(() => undefined);
}
