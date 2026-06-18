/**
 * ExecutionService unit tests — mock repos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repo/executionRepo.js', () => ({
  executionRepo: {
    getById: vi.fn(),
    getStatusById: vi.fn(),
    getLogs: vi.fn(),
    listHistoryByWorkflow: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock('../../src/db.js', () => ({
  getDb: () => ({ prepare: () => ({ run: vi.fn() }) }),
}));

vi.mock('../../src/websocket.js', () => ({
  default: { sendLog: vi.fn(), sendError: vi.fn() },
  logExecution: vi.fn(),
}));

import { ExecutionService } from '../../src/services/executionService.js';
import { executionRepo } from '../../src/repo/executionRepo.js';
import { NotFoundError } from '../../src/errors.js';

let activeExecutions;
let stepControls;

beforeEach(() => {
  vi.clearAllMocks();
  activeExecutions = new Map();
  stepControls = new Map();
});

function createService() {
  return new ExecutionService();
}

describe('ExecutionService', () => {
  describe('getStatus', () => {
    it('returns execution with parsed outputs and logs', () => {
      executionRepo.getById.mockReturnValue({ id: 'e1', status: 'completed', output_files: '["/tmp/out.json"]', results: '[]' });
      executionRepo.getLogs.mockReturnValue([{ level: 'info', message: 'done', timestamp: '2025-01-01' }]);
      const result = createService().getStatus('e1');
      expect(result.data.id).toBe('e1');
      expect(result.data.output_files).toEqual(['/tmp/out.json']);
      expect(result.data.logs).toHaveLength(1);
    });

    it('returns error for unknown execution', () => {
      executionRepo.getById.mockReturnValue(undefined);
      const result = createService().getStatus('none');
      expect(result.error).toBe('Execution not found');
      expect(result.status).toBe(404);
    });
  });

  describe('cancel', () => {
    it('cancels an active execution', () => {
      const ac = new AbortController();
      activeExecutions.set('e1', ac);
      const result = createService().cancel('e1', activeExecutions);
      expect(result.data.status).toBe('cancelled');
    });

    it('returns error for finished execution', () => {
      executionRepo.getStatusById.mockReturnValue({ status: 'completed' });
      const result = createService().cancel('e1', activeExecutions);
      expect(result.data.status).toBe('completed');
    });

    it('returns error for unknown execution', () => {
      executionRepo.getStatusById.mockReturnValue(undefined);
      const result = createService().cancel('unknown', activeExecutions);
      expect(result.error).toBe('Execution not found');
    });
  });

  describe('history', () => {
    it('returns history from repo', () => {
      executionRepo.listHistoryByWorkflow.mockReturnValue([{ id: 'e1' }]);
      const result = createService().history(1);
      expect(result.data).toEqual([{ id: 'e1' }]);
      expect(executionRepo.listHistoryByWorkflow).toHaveBeenCalledWith(1, 20);
    });
  });
});
