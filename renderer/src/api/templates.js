/**
 * Templates module.
 */
import client from "./client";

export function fetchTemplates() {
  return client.get("/templates").then((r) => r.data.data || []);
}
