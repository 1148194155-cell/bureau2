/**
 * Workflow Service — 工作流 CRUD + 执行 + 调度器 + webhook。
 * 包含 activeExecutions / stepControls 共享状态，供路由层 + execution 子路由使用。
 * @since 2025-01 阶段2：从 workflow route 提取，消除路由层中内联 SQL。
 */
import { v4 as uuidv4 } from 'uuid';
import { getDb, cleanupOldRecords } from '../db.js';
import { workflowRepo } from '../repo/workflowRepo.js';
import { executionRepo } from '../repo/executionRepo.js';
import { modelRepo } from '../repo/modelRepo.js';
import { executeWorkflow } from '../engine/executor.js';
import { createAdapter } from '../models/adapter.js';
import wsManager, { logExecution } from '../websocket.js';
import { reviewPreExecution, reviewPostExecution } from '../review/reviewer.js';
import { buildSkillsList } from '../services/skillService.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { schedulerService } from './schedulerService.js';
import { createLogger } from '../logger.js';

const log = createLogger('workflow-service');

// ── State ──
export const activeExecutions = new Map();
export const stepControls = new Map();

export class WorkflowService {
  list(userId) {
    return workflowRepo.listByUser(userId);
  }

  get(id, userId) {
    const wf = workflowRepo.getById(id, userId);
    if (!wf) throw new NotFoundError(`Workflow ${id} not found`);
    return {
      ...wf,
      nodes: JSON.parse(wf.nodes || '[]'),
      edges: JSON.parse(wf.edges || '[]'),
    };
  }

  create(userId, { name, nodes, edges }) {
    if (!name) throw new ValidationError('name is required');
    return workflowRepo.create({ userId, name, nodes: nodes || [], edges: edges || [] });
  }

  update(id, userId, { name, nodes, edges }) {
    const existing = workflowRepo.getById(id, userId);
    if (!existing) throw new NotFoundError(`Workflow ${id} not found`);
    workflowRepo.update(id, userId, {
      name: name ?? existing.name,
      nodes: nodes ?? JSON.parse(existing.nodes || '[]'),
      edges: edges ?? JSON.parse(existing.edges || '[]'),
    });
  }

  delete(id, userId) {
    const existing = workflowRepo.getById(id, userId);
    if (!existing) throw new NotFoundError(`Workflow ${id} not found`);
    executionRepo.deleteByWorkflow(id);
    workflowRepo.delete(id, userId);
  }
}

// ── Core execution helper ──

async function executeWorkflowAsync(executionId, workflowDef, userId, db, skillsList, options) {
  const emitLog = (level, message) => logExecution(db, wsManager, executionId, level, message);
  try {
    const skillsMap = {};
    for (const skill of skillsList) {
      if (skill.id) skillsMap[skill.id] = skill;
    }
    const models = modelRepo.listActiveByUser(userId);
    const adaptersMap = {};
    for (const model of models) {
      try {
        adaptersMap[model.id] = createAdapter(model);
        emitLog('debug', `Adapter created: id=${model.id}, type=${model.adapter_type}`);
      } catch (err) {
        emitLog('warn', `Failed to create adapter for "${model.name}": ${err.message}`);
      }
    }
    if (!adaptersMap['builtin']) {
      try {
        adaptersMap['builtin'] = createAdapter({ id: 'builtin', name: '内置模型 (本地)', adapter_type: 'builtin', config: {} });
        emitLog('debug', 'Adapter created: id=builtin');
      } catch (err) {
        emitLog('warn', `Failed to create builtin adapter: ${err.message}`);
      }
    }
    emitLog('info', `Starting execution ${executionId}${options.mode === 'step' ? ' (逐步模式)' : ''}`);
    const result = await executeWorkflow({
      workflow: workflowDef,
      skills: skillsMap,
      adapters: adaptersMap,
      onLog: emitLog,
      options: { ...options, workflowId: workflowDef.id, executionId },
    });
    const postReview = reviewPostExecution(result.outputFiles || []);
    logExecution(db, wsManager, executionId, 'review', JSON.stringify(postReview));
    executionRepo.complete(executionId, { outputFiles: result.outputFiles || [], results: result.results || [] });
    emitLog('info', 'Execution completed successfully');
    wsManager.sendComplete(executionId, result);
  } catch (err) {
    emitLog('error', `Execution failed: ${err.message}`);
    executionRepo.fail(executionId, err.message);
    wsManager.sendError(executionId, err.message);
  }
}

export async function runWorkflow(userId, body) {
  const db = getDb();
  const { workflow_id, nodes, edges, options, mode } = body;
  let workflowDef;
  if (workflow_id) {
    const stored = workflowRepo.getById(workflow_id, userId);
    if (!stored) return { error: 'Workflow not found', status: 404 };
    workflowDef = { id: stored.id, nodes: JSON.parse(stored.nodes || '[]'), edges: JSON.parse(stored.edges || '[]') };
  } else if (nodes && edges) {
    workflowDef = { nodes, edges };
  } else {
    return { error: 'Provide either workflow_id or nodes+edges', status: 400 };
  }

  const executionId = uuidv4();
  const skillsList = await buildSkillsList();
  const activeModels = modelRepo.listActiveByUser(userId);
  const preReview = reviewPreExecution(workflowDef, skillsList, activeModels);
  if (preReview.status === 'fail') {
    return { error: 'Workflow review failed', review: preReview, status: 422 };
  }

  executionRepo.create({ id: executionId, workflowId: workflow_id || null, userId, status: 'running' });

  logExecution(getDb(), wsManager, executionId, 'review', JSON.stringify(preReview));
  const abortController = new AbortController();
  activeExecutions.set(executionId, abortController);
  executeWorkflowAsync(executionId, workflowDef, userId, getDb(), skillsList, { ...options, mode }).catch(err => {
    log.error({ err }, 'Unhandled execution error');
  }).finally(() => activeExecutions.delete(executionId));

  return { data: { execution_id: executionId } };
}

export async function webhookRun(workflowName, userId, reqBody) {
  const db = getDb();
  let wf = getDb().prepare('SELECT id, nodes, edges FROM workflows WHERE name = ? AND user_id = ?').get(workflowName, userId);
  if (!wf) {
    const nodes = [
      { id: 'in', type: 'input', position: { x: 100, y: 200 }, data: { label: 'Webhook Input' } },
      { id: 'out', type: 'output', position: { x: 400, y: 200 }, data: { label: 'Webhook Output' } },
    ];
    const edges = [{ id: 'e1', source: 'in', target: 'out' }];
    const result = workflowRepo.create({ userId, name: workflowName, nodes, edges });
    wf = { id: result.id, nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) };
  }
  const workflowNodes = JSON.parse(wf.nodes || '[]');
  const workflowEdges = JSON.parse(wf.edges || '[]');
  let injected = false;
  for (const n of workflowNodes) {
    if (n.type === 'input') { if (!n.data) n.data = {}; n.data.input = reqBody; injected = true; break; }
  }
  if (!injected) {
    workflowNodes.unshift({ id: 'wh_in', type: 'input', position: { x: 100, y: 200 }, data: { label: 'Webhook', input: reqBody } });
  }
  const workflowDef = { id: wf.id, nodes: workflowNodes, edges: workflowEdges };
  const executionId = uuidv4();
  const skillsList = await buildSkillsList();
  const preReview = reviewPreExecution(workflowDef, skillsList, []);
  if (preReview.status === 'fail') {
    return { data: { execution_id: executionId, workflow_name: workflowName, workflow_id: wf.id }, reviewError: true, preReview };
  }
  executionRepo.create({ id: executionId, workflowId: wf.id, userId, status: 'running' });
  logExecution(getDb(), wsManager, executionId, 'info', `[Webhook] ${workflowName} 触发执行`);
  executeWorkflowAsync(executionId, workflowDef, userId, getDb(), skillsList, {}).catch(err => {
    log.error({ err }, 'Webhook execution error');
  }).finally(() => activeExecutions.delete(executionId));
  return { data: { execution_id: executionId, workflow_name: workflowName, workflow_id: wf.id } };
}

// ── Scheduler delegation ──
// Scheduler lifecycle + cron parsing delegated to SchedulerService.

// Register the tick callback: execute workflow on each due schedule.
schedulerService.setOnTick(async (workflowDef, sched) => {
  const db = getDb();
  const executionId = uuidv4();
  const skillsList = await buildSkillsList();
  executionRepo.create({ id: executionId, workflowId: sched.workflow_id, userId: sched.user_id, status: 'running' });
  logExecution(db, wsManager, executionId, 'info', `[定时执行] 调度触发 #${sched.workflow_id}`);
  executeWorkflowAsync(executionId, workflowDef, sched.user_id, db, skillsList, {}).catch(err => {
    log.error({ err }, `Scheduled workflow ${sched.workflow_id} failed`);
  });
});

export const startScheduler = (intervalMs) => schedulerService.start(intervalMs);
export const stopScheduler = () => schedulerService.stop();
export { parseCronNext } from './schedulerService.js';

export const workflowService = new WorkflowService();
