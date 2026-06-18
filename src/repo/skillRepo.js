/**
 * Discovered skills 表仓库层。
 * @since 2025-01 阶段1：SQL 从路由层剥离。
 */
import { getDb } from '../db.js';

export class SkillRepo {
  listDiscovered() {
    return getDb().prepare(
      'SELECT name, description, skill_path, version FROM discovered_skills'
    ).all();
  }
}

export const skillRepo = new SkillRepo();
