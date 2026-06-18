/**
 * API Key Service — API Key 加密存储/管理。
 * @since 2025-01 阶段2：从 apikey route 提取。
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { getDb } from '../db.js';
import { encrypt } from '../crypto.js';
import { createLogger } from '../logger.js';

const log = createLogger('apikey-service');

export class ApiKeyService {
  list(userId) {
    return getDb().prepare(
      'SELECT id, name, key_ref, created_at FROM api_keys WHERE user_id = ?'
    ).all(userId);
  }

  async create(userId, { name, api_key }) {
    if (!name || !api_key) {
      return { error: 'name and api_key are required', status: 400 };
    }
    const keyRef = `lc_${userId}_${name}_${Date.now()}`;
    const encrypted = encrypt(api_key);
    const keyDir = path.join(os.homedir(), '.localcanvas', 'keys');
    await fs.ensureDir(keyDir);
    await fs.writeFile(path.join(keyDir, `${keyRef}.enc`), encrypted, 'utf8');
    const result = getDb().prepare(
      'INSERT INTO api_keys (user_id, name, key_ref) VALUES (?, ?, ?)'
    ).run(userId, name, keyRef);
    return { data: { id: result.lastInsertRowid, name, key_ref: keyRef } };
  }

  async delete(id, userId) {
    const key = getDb().prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?').get(id, userId);
    if (!key) return { error: 'API key not found', status: 404 };
    const keyPath = path.join(os.homedir(), '.localcanvas', 'keys', `${key.key_ref}.enc`);
    await fs.remove(keyPath);
    getDb().prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    return { success: true };
  }
}

export const apiKeyService = new ApiKeyService();
