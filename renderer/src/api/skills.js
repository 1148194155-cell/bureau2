/**
 * Skills API module.
 */
import client from "./client";

export function fetchSkills() {
  return client.get("/skills").then((r) => r.data.data || []);
}
