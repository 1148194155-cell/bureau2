/**
 * Workflows 表仓库层 — 封装所有 workflow 表 SQL，返回普通对象。
 * @since 2025-01 阶段1：将 SQL 从路由层剥离到独立的 Repository 层。
 */
import { getDb } from '../db.js';

export class WorkflowRepo {
  listByUser(userId) {
    return getDb().prepare(
      'SELECT id, name, created_at, updated_at FROM workflows WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(userId);
  }

  getById(id, userId) {
    return getDb().prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?').get(id, userId);
  }

  create({ userId, name, nodes, edges }) {
    const r = getDb().prepare(
      'INSERT INTO workflows (user_id, name, nodes, edges) VALUES (?, ?, ?, ?)'
    ).run(userId, name, JSON.stringify(nodes), JSON.stringify(edges));
    return { id: r.lastInsertRowid };
  }

  update(id, userId, { name, nodes, edges }) {
    getDb().prepare(
      'UPDATE workflows SET name = ?, nodes = ?, edges = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
    ).run(name, JSON.stringify(nodes), JSON.stringify(edges), id, userId);
  }

  delete(id, userId) {
    getDb().prepare('DELETE FROM workflows WHERE id = ? AND user_id = ?').run(id, userId);
  }
}

export const workflowRepo = new WorkflowRepo();
