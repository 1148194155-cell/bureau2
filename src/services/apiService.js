/**
 * API Service — 外部 API 端点 CRUD。
 * @since 2025-01 阶段2：从 api route 提取。
 */
import { getDb } from '../db.js';
import { scanApis } from '../scanner/skillScanner.js';
import { apiRepo } from '../repo/apiRepo.js';

export class ApiService {
  async list(userId) {
    return scanApis(getDb(), userId);
  }

  create(userId, { name, url, method, headers, description }) {
    return apiRepo.create({ userId, name, url, method, headers, description });
  }

  delete(id, userId) {
    const result = apiRepo.delete(id, userId);
    if (result.changes === 0) return { error: 'API not found', status: 404 };
    return { success: true };
  }
}

export const apiService = new ApiService();
