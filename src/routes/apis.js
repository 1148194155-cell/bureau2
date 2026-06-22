/**
 * API endpoint routes — thin HTTP layer.
 */
import { Router } from 'express';
import { apiService } from '../services/apiService.js';
import { authRequired, getUserId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

const router = Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const createApiSchema = z.object({
  name: z.string().min(1, 'name is required'),
  url: z.string().min(1, 'url is required'),
  method: z.string().optional().default('GET'),
  headers: z.record(z.string()).optional().default({}),
  description: z.string().optional().default(''),
});

router.get('/apis', authRequired, asyncHandler(async (req, res) => {
  const apis = await apiService.list(getUserId(req));
  res.json({ success: true, data: apis });
}));

router.post('/apis', authRequired, validate({ body: createApiSchema }), asyncHandler(async (req, res) => {
  const result = apiService.create(getUserId(req), req.body);
  res.json({ success: true, data: result });
}));

router.delete('/apis/:id', authRequired, asyncHandler(async (req, res) => {
  const result = apiService.delete(req.params.id, getUserId(req));
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  res.json({ success: true });
}));

export default router;
