/**
 * Workflow routes — thin HTTP layer.
 */
import { Router } from 'express';
import { workflowService, activeExecutions, stepControls, runWorkflow, webhookRun, parseCronNext } from '../services/workflowService.js';
import { getDb } from '../db.js';
import { authRequired, getUserId } from '../middleware/auth.js';
import { createExecutionRouter } from './executions.js';

const router = Router();
const ah = (fn) => (req, res, n) => Promise.resolve(fn(req, res, n)).catch(n);

router.get('/workflows', authRequired, ah((req, res) => { res.json({ success: true, data: workflowService.list(getUserId(req)) }); }));
router.get('/workflows/:id', authRequired, ah((req, res) => {
  res.json({ success: true, data: workflowService.get(req.params.id, getUserId(req)) });
}));
router.post('/workflows', authRequired, ah((req, res) => {
  res.json({ success: true, data: workflowService.create(getUserId(req), req.body) });
}));
router.put('/workflows/:id', authRequired, ah((req, res) => {
  workflowService.update(req.params.id, getUserId(req), req.body);
  res.json({ success: true });
}));
router.delete('/workflows/:id', authRequired, ah((req, res) => {
  workflowService.delete(req.params.id, getUserId(req));
  res.json({ success: true });
}));

router.post('/workflows/run', authRequired, ah(async (req, res) => {
  const r = await runWorkflow(getUserId(req), req.body);
  if (r.error) return res.status(r.status||500).json({ success: false, error: r.error, review: r.review });
  res.json({ success: true, data: r.data });
}));

router.post('/webhook/:name', ah(async (req, res) => {
  const r = await webhookRun(req.params.name, getUserId(req)||1, req.body);
  if (r.reviewError) return res.status(422).json({ success:false, error:'Workflow review failed', review:r.preReview, execution_id:r.data.execution_id });
  res.json({ success: true, data: r.data });
}));

router.get('/schedules', authRequired, ah((req, res) => {
  const db = getDb(), wfId = req.query.workflow_id;
  res.json({ success:true, data: wfId
    ? db.prepare('SELECT s.*, w.name workflow_name FROM workflow_schedules s JOIN workflows w ON s.workflow_id=w.id WHERE s.workflow_id=?').all(wfId)
    : db.prepare('SELECT s.*, w.name workflow_name FROM workflow_schedules s JOIN workflows w ON s.workflow_id=w.id').all() });
}));
router.post('/schedules', authRequired, ah((req, res) => {
  const db=getDb(), {workflow_id,cron_expression,enabled}=req.body;
  if (!workflow_id||!cron_expression) return res.status(400).json({success:false,error:'workflow_id and cron_expression are required'});
  if (!db.prepare('SELECT 1 FROM workflows WHERE id=?').get(workflow_id)) return res.status(404).json({success:false,error:'Workflow not found'});
  const nx=parseCronNext(cron_expression);
  const r=db.prepare('INSERT INTO workflow_schedules(workflow_id,cron_expression,enabled,next_run)VALUES(?,?,?,?)').run(workflow_id, cron_expression, enabled?1:0, nx?.toISOString()||null);
  res.json({success:true,data:{id:r.lastInsertRowid, next_run:nx?.toISOString()||null}});
}));
router.put('/schedules/:id', authRequired, ah((req, res) => {
  const db=getDb(),{cron_expression,enabled}=req.body, u=[], p=[];
  if (cron_expression!==undefined){const nx=parseCronNext(cron_expression);u.push('cron_expression=?','next_run=?');p.push(cron_expression,nx?.toISOString()||null);}
  if (enabled!==undefined){u.push('enabled=?');p.push(enabled?1:0);}
  if (!u.length) return res.status(400).json({success:false,error:'Nothing to update'});
  u.push('updated_at=CURRENT_TIMESTAMP');p.push(req.params.id);
  const r=db.prepare(`UPDATE workflow_schedules SET ${u.join(',')} WHERE id=?`).run(...p);
  if (!r.changes) return res.status(404).json({success:false,error:'Schedule not found'});
  res.json({success:true,data:{id:+req.params.id}});
}));
router.delete('/schedules/:id', authRequired, ah((req, res) => {
  const r=getDb().prepare('DELETE FROM workflow_schedules WHERE id=?').run(req.params.id);
  if (!r.changes) return res.status(404).json({success:false,error:'Schedule not found'});
  res.json({success:true,data:{deleted:true}});
}));

router.use('/executions', createExecutionRouter({ activeExecutions, stepControls }));
export { workflowService };
export default router;
