/**
 * WorkflowService unit tests — mock repos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('../../src/repo/workflowRepo.js', () => ({
  workflowRepo: {
    listByUser: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/repo/executionRepo.js', () => ({
  executionRepo: {
    create: vi.fn(),
    deleteByWorkflow: vi.fn(),
  },
}));

vi.mock('../../src/db.js', () => ({
  getDb: () => ({
    prepare: () => ({
      all: vi.fn(),
      get: vi.fn(),
      run: vi.fn(),
    }),
  }),
}));

vi.mock('../../src/websocket.js', () => ({
  default: { sendLog: vi.fn(), sendComplete: vi.fn(), sendError: vi.fn() },
  logExecution: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: () => 'mocked-uuid',
}));

import { workflowService, WorkflowService, runWorkflow } from '../../src/services/workflowService.js';
import { workflowRepo } from '../../src/repo/workflowRepo.js';
import { NotFoundError, ValidationError } from '../../src/errors.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkflowService', () => {
  describe('list', () => {
    it('returns all workflows for user', () => {
      workflowRepo.listByUser.mockReturnValue([{ id: 1, name: 'Test' }]);
      expect(workflowService.list(1)).toEqual([{ id: 1, name: 'Test' }]);
      expect(workflowRepo.listByUser).toHaveBeenCalledWith(1);
    });
  });

  describe('get', () => {
    it('returns parsed workflow when found', () => {
      workflowRepo.getById.mockReturnValue({
        id: 1, user_id: 1, name: 'Test',
        nodes: '[{"id":"a"}]', edges: '[{"source":"a","target":"b"}]',
      });
      const result = workflowService.get(1, 1);
      expect(result.name).toBe('Test');
      expect(result.nodes).toEqual([{ id: 'a' }]);
      expect(result.edges).toEqual([{ source: 'a', target: 'b' }]);
    });

    it('throws NotFoundError when workflow not found', () => {
      workflowRepo.getById.mockReturnValue(undefined);
      expect(() => workflowService.get(999, 1)).toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('creates workflow with valid data', () => {
      workflowRepo.create.mockReturnValue({ id: 1 });
      const result = workflowService.create(1, { name: 'New' });
      expect(result).toEqual({ id: 1 });
      expect(workflowRepo.create).toHaveBeenCalledWith({ userId: 1, name: 'New', nodes: [], edges: [] });
    });

    it('throws ValidationError when name is missing', () => {
      expect(() => workflowService.create(1, {})).toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('updates existing workflow', () => {
      workflowRepo.getById.mockReturnValue({ id: 1, user_id: 1, name: 'Old', nodes: '[]', edges: '[]' });
      workflowService.update(1, 1, { name: 'Updated' });
      expect(workflowRepo.update).toHaveBeenCalled();
    });

    it('throws NotFoundError when workflow does not exist', () => {
      workflowRepo.getById.mockReturnValue(undefined);
      expect(() => workflowService.update(999, 1, {})).toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('deletes workflow and cascade deletes executions', () => {
      workflowRepo.getById.mockReturnValue({ id: 1, user_id: 1 });
      workflowService.delete(1, 1);
      expect(workflowRepo.delete).toHaveBeenCalledWith(1, 1);
    });

    it('throws NotFoundError when workflow does not exist', () => {
      workflowRepo.getById.mockReturnValue(undefined);
      expect(() => workflowService.delete(999, 1)).toThrow(NotFoundError);
    });
  });

  describe('run', () => {
    it('returns error when no workflow_id nor nodes+edges', async () => {
      const result = await runWorkflow(1, {});
      expect(result.error).toBe('Provide either workflow_id or nodes+edges');
      expect(result.status).toBe(400);
    });

    it('returns error when workflow_id not found', async () => {
      workflowRepo.getById.mockReturnValue(undefined);
      const result = await runWorkflow(1, { workflow_id: 999 });
      expect(result.error).toBe('Workflow not found');
      expect(result.status).toBe(404);
    });
  });
});
