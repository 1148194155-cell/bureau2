/**
 * Skills API module.
 */
import client from "./client";

export function fetchSkills() {
  return client.get("/skills").then((r) => r.data.data || []);
}

export function fetchSkillStore() {
  return client.get("/skills/store").then((r) => r.data.data || []);
}

export function installSkill(skillId) {
  return client.post("/skills/install", { skill_id: skillId }).then((r) => r.data);
}
