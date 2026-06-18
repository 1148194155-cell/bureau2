/**
 * Skill Service — 技能列表构建，整合 Scanner 结果 + DB 已发现技能。
 * @since 2025-01 阶段2：从 skills route 提取 buildSkillsList 到 Service 层。
 */
import { skillRepo } from '../repo/skillRepo.js';
import { scanSkills } from '../scanner/skillScanner.js';
import { getDb } from '../db.js';

export class SkillService {
  async buildSkillsList(db) {
    if (!db) db = getDb();
    const skills = await scanSkills();
    const discovered = skillRepo.listDiscovered();
    for (const ds of discovered) {
      if (skills.some(s => s.id === ds.name)) continue;
      skills.push({
        id: `discovered:${ds.skill_path}`,
        name: ds.name,
        description: ds.description || '',
        path: ds.skill_path,
        entry: null,
        type: 'discovered',
      });
    }
    return skills;
  }

  async list() {
    return this.buildSkillsList();
  }
}

export const skillService = new SkillService();
export const buildSkillsList = (...args) => skillService.buildSkillsList(...args);
