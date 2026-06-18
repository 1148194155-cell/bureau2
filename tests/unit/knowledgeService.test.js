/**
 * KnowledgeService unit tests — mock repos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repo/knowledgeRepo.js', () => ({
  knowledgeRepo: {
    listByUser: vi.fn(),
    getBaseById: vi.fn(),
    createBase: vi.fn(),
    deleteBase: vi.fn(),
  },
}));

vi.mock('../../src/db.js', () => ({
  getDb: () => ({ prepare: () => ({ all: vi.fn(), get: vi.fn(), run: vi.fn() }) }),
}));

import { knowledgeService } from '../../src/services/knowledgeService.js';
import { knowledgeRepo } from '../../src/repo/knowledgeRepo.js';
import { NotFoundError, ValidationError } from '../../src/errors.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KnowledgeService', () => {
  describe('list', () => {
    it('returns knowledge bases for user', () => {
      knowledgeRepo.listByUser.mockReturnValue([{ id: 1, name: 'Docs' }]);
      expect(knowledgeService.list(1)).toEqual([{ id: 1, name: 'Docs' }]);
    });
  });

  describe('create', () => {
    it('creates with valid data', () => {
      knowledgeRepo.createBase.mockReturnValue({ id: 1 });
      const result = knowledgeService.create(1, { name: 'KB', folder_path: '/tmp/kb' });
      expect(result).toEqual({ id: 1 });
    });

    it('throws ValidationError when name missing', () => {
      expect(() => knowledgeService.create(1, { folder_path: '/tmp' })).toThrow(ValidationError);
    });

    it('throws ValidationError when folder_path missing', () => {
      expect(() => knowledgeService.create(1, { name: 'KB' })).toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('deletes when found', () => {
      knowledgeRepo.deleteBase.mockReturnValue({ changes: 1 });
      knowledgeRepo.getBaseById.mockReturnValue({ id: 1 });
      knowledgeService.delete(1, 1);
      expect(knowledgeRepo.deleteBase).toHaveBeenCalledWith(1, 1);
    });

    it('throws NotFoundError when not found', () => {
      knowledgeRepo.deleteBase.mockReturnValue({ changes: 0 });
      expect(() => knowledgeService.delete(999, 1)).toThrow(NotFoundError);
    });
  });
});
