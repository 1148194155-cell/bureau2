/**
 * AI Chat route — thin HTTP layer.
 */
import { Router } from 'express';
import { aiService } from '../services/aiService.js';
import { authRequired, getUserId } from '../middleware/auth.js';

const router = Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.post('/ai/chat', authRequired, asyncHandler(async (req, res) => {
  const { message, history, canvas_state, model_id } = req.body;
  try {
    const data = await aiService.chat(getUserId(req), { message, history, canvas_state, model_id, lang: req.body.lang });
    res.json({ success: true, data });
  } catch (err) {
    if (err.name === 'AppError') return res.status(err.httpStatus).json(err.toJSON());
    throw err;
  }
}));

export default router;
