/**
 * Auth routes — thin HTTP layer.
 */
import { Router } from 'express';
import { authService } from '../services/authService.js';
import { authRequired, getAuthDisabled, setAuthDisabled } from '../middleware/auth.js';

const router = Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/auth/status', asyncHandler(async (req, res) => {
  res.json({ success: true, data: { authDisabled: getAuthDisabled() } });
}));

router.post('/auth/toggle', asyncHandler(async (req, res) => {
  setAuthDisabled(req.body.disabled);
  res.json({ success: true, data: { authDisabled: getAuthDisabled() } });
}));

router.post('/auth/login', asyncHandler(async (req, res) => {
  const result = authService.login(req.body);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  res.json({ success: true, data: result.data });
}));

router.post('/auth/register', asyncHandler(async (req, res) => {
  const result = authService.register(req.body);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  res.status(result.status || 201).json({ success: true, data: result.data });
}));

router.get('/auth/me', authRequired, asyncHandler(async (req, res) => {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '') || req.headers['x-auth-token'];
  const result = authService.me(token);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  res.json({ success: true, data: result.data });
}));

export default router;
