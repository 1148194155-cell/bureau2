import { getDb } from '../db.js';
/**
 * Execution Service — 执行状态/取消/步骤控制/历史/对比。
 * @since 2025-01 阶段2：从 executions route 提取。
 */
import { executionRepo } from '../repo/executionRepo.js';
import wsManager, { logExecution } from '../websocket.js';

const tryParse = (v) => { try { return v ? JSON.parse(v) : []; } catch { return []; } };

export class ExecutionService {
  getStatus(id) {
    const execution = executionRepo.getById(id);
    if (!execution) return { error: 'Execution not found', status: 404 };
    const logs = executionRepo.getLogs(id);
    return {
      data: {
        ...execution,
        output_files: execution.output_files ? JSON.parse(execution.output_files) : [],
        results: execution.results ? JSON.parse(execution.results) : [],
        logs,
      },
    };
  }

  cancel(id, activeExecutions) {
    const controller = activeExecutions.get(id);
    if (!controller) {
      const exec = executionRepo.getStatusById(id);
      if (!exec) return { error: 'Execution not found', status: 404 };
      if (['completed', 'failed', 'cancelled'].includes(exec.status)) {
        return { data: { status: exec.status } };
      }
      return { error: 'Execution is not cancellable', status: 409 };
    }
    controller.abort();
    executionRepo.updateStatus(id, 'cancelled', { endTime: new Date().toISOString(), error: 'Cancelled by user' });
    logExecution(getDb(), wsManager, id, 'warn', '执行已被用户取消');
    wsManager.sendError(id, 'Cancelled by user');
    return { data: { status: 'cancelled' } };
  }

  step(executionId, { action }, activeExecutions, stepControls) {
    const sc = stepControls.get(executionId);
    if (!sc) {
      const exec = executionRepo.getStatusById(executionId);
      if (!exec) return { error: 'Execution not found', status: 404 };
      if (exec.status !== 'running') {
        return { data: { status: exec.status, message: 'Execution already finished' } };
      }
      return { error: 'No pending step for this execution', status: 409 };
    }
    stepControls.delete(executionId);
    if (action === 'stop') {
      sc.resolve('stop');
    executionRepo.updateStatus(executionId, 'cancelled', { endTime: new Date().toISOString(), error: 'Stopped by user' });
    logExecution(getDb(), wsManager, executionId, 'warn', '执行已被用户停止');
      return { data: { action: 'stop' } };
    }
    sc.resolve(action === 'skip' ? 'skip' : 'continue');
    return { data: { action: action || 'continue', node: sc.node?.label } };
  }

  history(workflowId, limit = 20) {
    return { data: executionRepo.listHistoryByWorkflow(workflowId, limit) };
  }

  compare({ execution_id_a, execution_id_b }) {
    if (!execution_id_a || !execution_id_b) {
      return { error: 'Both execution_id_a and execution_id_b are required', status: 400 };
    }
    const execA = executionRepo.getById(execution_id_a);
    const execB = executionRepo.getById(execution_id_b);
    if (!execA || !execB) return { error: 'One or both executions not found', status: 404 };

    const logsA = executionRepo.getLogs(execution_id_a);
    const logsB = executionRepo.getLogs(execution_id_b);

    return {
      data: {
        a: { id: execA.id, status: execA.status, started: execA.start_time, ended: execA.end_time, logCount: logsA.length, errorCount: logsA.filter(l => l.level === 'error').length, outputs: tryParse(execA.output_files) },
        b: { id: execB.id, status: execB.status, started: execB.start_time, ended: execB.end_time, logCount: logsB.length, errorCount: logsB.filter(l => l.level === 'error').length, outputs: tryParse(execB.output_files) },
        diff: {
          sameStatus: execA.status === execB.status,
          durationA: execA.end_time && execA.start_time ? new Date(execA.end_time) - new Date(execA.start_time) : null,
          durationB: execB.end_time && execB.start_time ? new Date(execB.end_time) - new Date(execB.start_time) : null,
          moreErrorsIn: logsA.filter(l => l.level === 'error').length > logsB.filter(l => l.level === 'error').length ? 'A' : logsB.filter(l => l.level === 'error').length > logsA.filter(l => l.level === 'error').length ? 'B' : 'equal',
        },
      },
    };
  }
}

export const executionService = new ExecutionService();
