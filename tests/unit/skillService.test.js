/**
 * SkillService unit tests — mock scanner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repo/skillRepo.js', () => ({
  skillRepo: {
    listDiscovered: vi.fn(),
  },
}));

vi.mock('../../src/scanner/skillScanner.js', () => ({
  scanSkills: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  getDb: () => ({ prepare: () => ({ all: vi.fn() }) }),
}));

import { skillService } from '../../src/services/skillService.js';
import { skillRepo } from '../../src/repo/skillRepo.js';
import { scanSkills } from '../../src/scanner/skillScanner.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SkillService', () => {
  describe('list', () => {
    it('returns scanned skills when no discovered skills', async () => {
      scanSkills.mockResolvedValue([{ id: 'skill-a', name: 'A' }]);
      skillRepo.listDiscovered.mockReturnValue([]);
      const result = await skillService.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('A');
    });

    it('merges discovered skills not already in scanned list', async () => {
      scanSkills.mockResolvedValue([]);
      skillRepo.listDiscovered.mockReturnValue([{ name: 'DS1', description: 'Desc1', skill_path: '/path/to/ds1', version: '1.0' }]);
      const result = await skillService.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('DS1');
      expect(result[0].type).toBe('discovered');
    });

    it('avoids duplicates when discovered skill matches scanned id', async () => {
      scanSkills.mockResolvedValue([{ id: 'existing', name: 'Existing' }]);
      skillRepo.listDiscovered.mockReturnValue([{ name: 'existing', description: '', skill_path: '/path', version: '1.0' }]);
      const result = await skillService.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('existing');
    });
  });
});
