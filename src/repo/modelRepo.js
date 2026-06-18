/**
 * Models 表仓库层。
 * @since 2025-01 阶段1：SQL 从路由层剥离。
 */
import { getDb } from '../db.js';

export class ModelRepo {
  listByUser(userId) {
    return getDb().prepare('SELECT * FROM models WHERE user_id = ?').all(userId);
  }

  getById(id, userId) {
    return getDb().prepare('SELECT * FROM models WHERE id = ? AND user_id = ?').get(id, userId);
  }

  listActiveByUser(userId) {
    return getDb().prepare('SELECT * FROM models WHERE user_id = ? AND is_active = 1').all(userId);
  }

  create({ userId, name, adapterType, config }) {
    const r = getDb().prepare(
      'INSERT INTO models (user_id, name, adapter_type, config) VALUES (?, ?, ?, ?)'
    ).run(userId, name, adapterType, config);
    return { id: r.lastInsertRowid };
  }

  delete(id, userId) {
    return getDb().prepare('DELETE FROM models WHERE id = ? AND user_id = ?').run(id, userId);
  }
}

export const modelRepo = new ModelRepo();
