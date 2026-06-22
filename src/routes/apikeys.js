/**
 * API Key routes — thin HTTP layer.
 */
import { Router } from 'express';
import { apiKeyService } from '../services/apiKeyService.js';
import { authRequired, getUserId } from '../middleware/auth.js';

const router = Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/apikeys', authRequired, asyncHandler(async (req, res) => {
  const keys = apiKeyService.list(getUserId(req));
  res.json({ success: true, data: keys });
}));

router.post('/apikeys', authRequired, asyncHandler(async (req, res) => {
  const result = await apiKeyService.create(getUserId(req), req.body);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  res.json({ success: true, data: result.data });
}));

router.delete('/apikeys/:id', authRequired, asyncHandler(async (req, res) => {
  const result = await apiKeyService.delete(req.params.id, getUserId(req));
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  res.json({ success: true });
}));

export default router;
