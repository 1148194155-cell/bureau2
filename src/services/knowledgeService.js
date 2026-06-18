/**
 * Knowledge Service — 知识库 CRUD + 向量索引。
 * @since 2025-01 阶段2：从 knowledge route 提取。
 */
import { knowledgeRepo } from '../repo/knowledgeRepo.js';
import { getDb } from '../db.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { indexKnowledgeBase } from '../scanner/skillScanner.js';
import { createAdapter } from '../models/adapter.js';

export class KnowledgeService {
  list(userId) {
    return knowledgeRepo.listByUser(userId);
  }

  create(userId, { name, folder_path }) {
    if (!name || !folder_path) {
      throw new ValidationError('name and folder_path are required');
    }
    return knowledgeRepo.createBase({ userId, name, folderPath: folder_path });
  }

  async index(id, userId, { model_id } = {}) {
    const kb = knowledgeRepo.getBaseById(id, userId);
    if (!kb) throw new NotFoundError('Knowledge base not found');

    let embedFn = null;
    if (model_id) {
      let embedModel;
      if (model_id === 'builtin') {
        embedModel = { id: 'builtin', name: '内置模型 (本地)', adapter_type: 'builtin', config: {} };
      } else {
        const db = getDb();
        embedModel = db.prepare('SELECT * FROM models WHERE id = ? AND user_id = ?').get(model_id, userId);
      }
      if (embedModel) {
        const adapter = createAdapter(embedModel);
        embedFn = (texts) => adapter.embed(texts);
      }
    }
    return indexKnowledgeBase(getDb(), kb.id, kb.folder_path, embedFn);
  }

  delete(id, userId) {
    const result = knowledgeRepo.deleteBase(id, userId);
    if (result.changes === 0) throw new NotFoundError('Knowledge base not found');
  }
}

export const knowledgeService = new KnowledgeService();
