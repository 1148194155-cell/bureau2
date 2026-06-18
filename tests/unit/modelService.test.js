/**
 * ModelService unit tests — mock repos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repo/modelRepo.js', () => ({
  modelRepo: {
    listByUser: vi.fn(),
    getById: vi.fn(),
    listActiveByUser: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/db.js', () => ({
  getDb: () => ({
    prepare: () => ({ all: vi.fn(), get: vi.fn(), run: vi.fn() }),
  }),
}));

vi.mock('../../src/scanner/skillScanner.js', () => ({
  scanModels: vi.fn().mockResolvedValue([]),
}));

import { modelService } from '../../src/services/modelService.js';
import { modelRepo } from '../../src/repo/modelRepo.js';
import { NotFoundError, ValidationError } from '../../src/errors.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ModelService', () => {
  describe('list', () => {
    it('returns empty array when no cache and no scanned models', async () => {
      const result = await modelService.list();
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates model with valid data', async () => {
      modelRepo.create.mockReturnValue({ id: 1 });
      const result = await modelService.create(1, { name: 'GPT', adapter_type: 'openai', config: { model: 'gpt-4' } });
      expect(result.id).toBe(1);
      expect(result.name).toBe('GPT');
    });

    it('throws ValidationError when name is missing', async () => {
      await expect(modelService.create(1, { adapter_type: 'openai' })).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when adapter_type is missing', async () => {
      await expect(modelService.create(1, { name: 'GPT' })).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('deletes model when found', () => {
      modelRepo.delete.mockReturnValue({ changes: 1 });
      modelService.delete(1, 1);
      expect(modelRepo.delete).toHaveBeenCalledWith(1, 1);
    });

    it('throws NotFoundError when model not found', () => {
      modelRepo.delete.mockReturnValue({ changes: 0 });
      expect(() => modelService.delete(999, 1)).toThrow(NotFoundError);
    });
  });
});
