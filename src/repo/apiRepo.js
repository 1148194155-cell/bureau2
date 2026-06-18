/**
 * Apis 表仓库层。
 * @since 2025-01 阶段1：SQL 从路由层剥离。
 */
import { getDb } from '../db.js';

export class ApiRepo {
  listByUser(userId) {
    return getDb().prepare('SELECT * FROM apis WHERE user_id = ?').all(userId);
  }

  create({ userId, name, url, method, headers, description }) {
    const r = getDb().prepare(
      'INSERT INTO apis (user_id, name, url, method, headers, description) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, name, url, method || 'GET', JSON.stringify(headers || {}), description || '');
    return { id: r.lastInsertRowid };
  }

  delete(id, userId) {
    return getDb().prepare('DELETE FROM apis WHERE id = ? AND user_id = ?').run(id, userId);
  }
}

export const apiRepo = new ApiRepo();
