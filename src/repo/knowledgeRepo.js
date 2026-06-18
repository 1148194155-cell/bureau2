/**
 * Knowledge 相关表仓库层。
 * @since 2025-01 阶段1：SQL 从路由层剥离。
 */
import { getDb } from '../db.js';

export class KnowledgeRepo {
  listByUser(userId) {
    return getDb().prepare(
      'SELECT id, user_id, name, folder_path, last_indexed, created_at FROM knowledge_bases WHERE user_id = ?'
    ).all(userId);
  }

  getBaseById(id, userId) {
    return getDb().prepare('SELECT * FROM knowledge_bases WHERE id = ? AND user_id = ?').get(id, userId);
  }

  createBase({ userId, name, folderPath }) {
    const r = getDb().prepare(
      'INSERT INTO knowledge_bases (user_id, name, folder_path) VALUES (?, ?, ?)'
    ).run(userId, name, folderPath);
    return { id: r.lastInsertRowid };
  }

  deleteBase(id, userId) {
    return getDb().prepare('DELETE FROM knowledge_bases WHERE id = ? AND user_id = ?').run(id, userId);
  }
}

export const knowledgeRepo = new KnowledgeRepo();
