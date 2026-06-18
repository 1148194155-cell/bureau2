// Execution statistics module — thin HTTP layer.
import { Router } from 'express';
import { statsService } from '../services/statsService.js';

const router = Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/overview', asyncHandler(async (req, res) => {
  const result = statsService.overview();
  res.json({ success: true, data: result.data });
}));

router.get('/nodes', asyncHandler(async (req, res) => {
  const result = statsService.nodes();
  res.json({ success: true, data: result.data });
}));

export default router;
