/**
 * Model routes — thin HTTP layer.
 */
import { Router } from 'express';
import { modelService } from '../services/modelService.js';
import { authRequired, getUserId } from '../middleware/auth.js';

const router = Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/models', asyncHandler(async (req, res) => {
  const data = await modelService.list();
  res.json({ success: true, data });
}));

router.post('/models', authRequired, asyncHandler(async (req, res) => {
  try {
    const data = await modelService.create(getUserId(req), req.body);
    res.json({ success: true, data });
  } catch (err) {
    if (err.name === 'AppError') return res.status(err.httpStatus).json(err.toJSON());
    throw err;
  }
}));

router.delete('/models/:id', authRequired, asyncHandler(async (req, res) => {
  try {
    modelService.delete(req.params.id, getUserId(req));
    res.json({ success: true });
  } catch (err) {
    if (err.name === 'AppError') return res.status(err.httpStatus).json(err.toJSON());
    throw err;
  }
}));

export default router;
