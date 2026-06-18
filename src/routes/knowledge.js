/**
 * Knowledge base routes — thin HTTP layer.
 */
import { Router } from 'express';
import { knowledgeService } from '../services/knowledgeService.js';
import { authRequired, getUserId } from '../middleware/auth.js';

const router = Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/knowledge', asyncHandler(async (req, res) => {
  const bases = knowledgeService.list(getUserId(req));
  res.json({ success: true, data: bases });
}));

router.post('/knowledge', authRequired, asyncHandler(async (req, res) => {
  try {
    const data = knowledgeService.create(getUserId(req), req.body);
    res.json({ success: true, data });
  } catch (err) {
    if (err.name === 'AppError') return res.status(err.httpStatus).json(err.toJSON());
    throw err;
  }
}));

router.post('/knowledge/:id/index', authRequired, asyncHandler(async (req, res) => {
  try {
    const data = await knowledgeService.index(req.params.id, getUserId(req), req.body);
    res.json({ success: true, data });
  } catch (err) {
    if (err.name === 'AppError') return res.status(err.httpStatus).json(err.toJSON());
    throw err;
  }
}));

router.delete('/knowledge/:id', authRequired, asyncHandler(async (req, res) => {
  try {
    knowledgeService.delete(req.params.id, getUserId(req));
    res.json({ success: true });
  } catch (err) {
    if (err.name === 'AppError') return res.status(err.httpStatus).json(err.toJSON());
    throw err;
  }
}));

export default router;
