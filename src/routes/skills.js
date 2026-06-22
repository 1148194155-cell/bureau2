/**
 * Skills routes — thin HTTP layer.
 */
import { Router } from 'express';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { skillService } from '../services/skillService.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
const SKILLS_DIR = path.join(os.homedir(), '.localcanvas', 'skills');
const BUILTIN_SKILLS_DIR = path.resolve('builtin-skills');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/skills', authRequired, asyncHandler(async (req, res) => {
  const skills = await skillService.list();
  res.json({ success: true, data: skills });
}));

// ── Skill Store: list available (builtin + remote) skills ──
router.get('/skills/store', authRequired, asyncHandler(async (req, res) => {
  const items = [];
  if (await fs.pathExists(BUILTIN_SKILLS_DIR)) {
    const entries = await fs.readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jsonPath = path.join(BUILTIN_SKILLS_DIR, entry.name, 'skill.json');
      if (await fs.pathExists(jsonPath)) {
        try {
          const skill = await fs.readJson(jsonPath);
          items.push({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            version: skill.version,
            author: skill.author,
            icon: skill.icon,
            source: 'builtin',
            installed: await fs.pathExists(path.join(SKILLS_DIR, entry.name, 'skill.json')),
          });
        } catch {}
      }
    }
  }
  res.json({ success: true, data: items });
}));

// ── Install a builtin skill ──
router.post('/skills/install', authRequired, asyncHandler(async (req, res) => {
  const { skill_id } = req.body;
  if (!skill_id) return res.status(400).json({ success: false, error: 'skill_id is required' });

  const srcDir = path.join(BUILTIN_SKILLS_DIR, skill_id);
  if (!await fs.pathExists(srcDir)) {
    return res.status(404).json({ success: false, error: `Builtin skill "${skill_id}" not found` });
  }

  const destDir = path.join(SKILLS_DIR, skill_id);
  if (await fs.pathExists(destDir)) {
    return res.status(409).json({ success: false, error: '技能已安装' });
  }

  await fs.copy(srcDir, destDir);
  res.json({ success: true, data: { id: skill_id, message: '技能安装成功' } });
}));

export default router;
export const buildSkillsList = () => skillService.buildSkillsList();
