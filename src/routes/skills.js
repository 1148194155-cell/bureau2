/**
 * Skills routes — thin HTTP layer.
 */
import { Router } from 'express';
import { skillService } from '../services/skillService.js';

const router = Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/skills', asyncHandler(async (req, res) => {
  const skills = await skillService.list();
  res.json({ success: true, data: skills });
}));

export default router;
export const buildSkillsList = () => skillService.buildSkillsList();
