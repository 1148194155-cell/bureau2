/**
 * Execution routes — thin HTTP layer.
 * Factory: accepts shared state (activeExecutions, stepControls) from api.js.
 */
import { Router } from 'express';
import { executionService } from '../services/executionService.js';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function createExecutionRouter({ activeExecutions, stepControls }) {
  const router = Router();

  router.get('/:id/status', asyncHandler(async (req, res) => {
    const result = executionService.getStatus(req.params.id);
    if (result.error) return res.status(result.status).json({ success: false, error: result.error });
    res.json({ success: true, data: result.data });
  }));

  router.post('/:id/cancel', asyncHandler(async (req, res) => {
    const result = executionService.cancel(req.params.id, activeExecutions);
    if (result.error) return res.status(result.status).json({ success: false, error: result.error });
    res.json({ success: true, data: result.data });
  }));

  router.post('/:id/step', asyncHandler(async (req, res) => {
    const result = executionService.step(req.params.id, req.body, activeExecutions, stepControls);
    if (result.error) return res.status(result.status).json({ success: false, error: result.error });
    res.json({ success: true, data: result.data });
  }));

  router.get('/history/:workflowId', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const result = executionService.history(req.params.workflowId, limit);
    res.json({ success: true, data: result.data });
  }));

  router.post('/compare', asyncHandler(async (req, res) => {
    const result = executionService.compare(req.body);
    if (result.error) return res.status(result.status).json({ success: false, error: result.error });
    res.json({ success: true, data: result.data });
  }));

  return router;
}
