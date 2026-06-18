/**
 * Executions + execution_logs 表仓库层。
 * @since 2025-01 阶段1：SQL 从路由层剥离。
 */
import { getDb } from '../db.js';

export class ExecutionRepo {
  getById(id) {
    return getDb().prepare('SELECT * FROM executions WHERE id = ?').get(id);
  }

  getStatusById(id) {
    return getDb().prepare('SELECT status FROM executions WHERE id = ?').get(id);
  }

  create({ id, workflowId, userId, status }) {
    getDb().prepare(
      'INSERT INTO executions (id, workflow_id, user_id, status, start_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(id, workflowId, userId, status);
  }

  updateStatus(id, status, { endTime, error } = {}) {
    const sets = ['status = ?'];
    const params = [status];
    if (endTime) { sets.push('end_time = ?'); params.push(endTime); }
    if (error !== undefined) { sets.push('error = ?'); params.push(error); }
    params.push(id);
    getDb().prepare(`UPDATE executions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  complete(id, { outputFiles, results } = {}) {
    getDb().prepare(
      'UPDATE executions SET status = ?, end_time = CURRENT_TIMESTAMP, output_files = ?, results = ? WHERE id = ?'
    ).run('completed', JSON.stringify(outputFiles || []), JSON.stringify(results || []), id);
  }

  fail(id, errorMessage) {
    getDb().prepare(
      "UPDATE executions SET status = ?, end_time = CURRENT_TIMESTAMP, error = ? WHERE id = ?"
    ).run('failed', errorMessage, id);
  }

  listHistoryByWorkflow(workflowId, limit = 20) {
    limit = Math.min(limit, 100);
    return getDb().prepare(
      `SELECT e.id, e.status, e.start_time, e.end_time, e.error, e.output_files,
              (SELECT COUNT(*) FROM execution_logs WHERE execution_id = e.id) as log_count,
              (SELECT COUNT(*) FROM execution_logs WHERE execution_id = e.id AND level = 'error') as error_count
       FROM executions e WHERE e.workflow_id = ? ORDER BY e.start_time DESC LIMIT ?`
    ).all(workflowId, limit);
  }

  getLogs(executionId) {
    return getDb().prepare(
      'SELECT level, message, timestamp FROM execution_logs WHERE execution_id = ? ORDER BY id'
    ).all(executionId);
  }

  addLog({ executionId, level, message }) {
    getDb().prepare(
      'INSERT INTO execution_logs (execution_id, level, message) VALUES (?, ?, ?)'
    ).run(executionId, level, message);
  }

  deleteByWorkflow(workflowId) {
    getDb().prepare(
      'DELETE FROM execution_logs WHERE execution_id IN (SELECT id FROM executions WHERE workflow_id = ?)'
    ).run(workflowId);
    getDb().prepare('DELETE FROM executions WHERE workflow_id = ?').run(workflowId);
  }
}

export const executionRepo = new ExecutionRepo();
