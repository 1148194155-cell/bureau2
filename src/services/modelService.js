/**
 * Model Service — 模型 CRUD + 在线状态缓存 + 后台刷新。
 * @since 2025-01 阶段2：从 model route 提取，缓存逻辑集中在 Service 层。
 */
import { modelRepo } from '../repo/modelRepo.js';
import { getDb } from '../db.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { scanModels } from '../scanner/skillScanner.js';
import { createAdapter } from '../models/adapter.js';
import { createLogger } from '../logger.js';

const log = createLogger('models');

export class ModelService {
  constructor() {
    this._cache = null;
    this._cacheTime = 0;
    this._refreshing = false;
    this._timer = null;
    this._cacheTTL = 30000;
  }

  async _refreshCache() {
    if (this._refreshing) return;
    this._refreshing = true;
    try {
      const db = getDb();
      const models = await scanModels(db, 1);
      const userModelNames = new Set(models.filter(m => m.source === 'user').map(m => m.name));
      const deduped = models.filter(m => m.source === 'user' || !userModelNames.has(m.name));
      const modelsWithStatus = await Promise.all(
        deduped.map(async (m) => {
          if (m.online !== undefined) return m;
          let online = false;
          try {
            const adapter = createAdapter(m);
            online = await Promise.race([
              adapter.ping(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
            ]);
          } catch { /* offline */ }
          return { ...m, online };
        })
      );
      this._cache = modelsWithStatus.map(m => {
        const config = m.config ? (typeof m.config === 'string' ? JSON.parse(m.config) : { ...m.config }) : {};
        delete config.apiKey;
        return { ...m, config };
      });
      this._cacheTime = Date.now();
    } catch (err) {
      log.warn({ err }, 'Background refresh failed');
    } finally {
      this._refreshing = false;
    }
  }

  async list() {
    if (!this._cache) await this._refreshCache();
    return this._cache || [];
  }

  async create(userId, { name, adapter_type, config }) {
    if (!name || !adapter_type) {
      throw new ValidationError('name and adapter_type are required');
    }
    const safeConfig = { ...(config || {}) };
    let storedConfig;
    try {
      const cryptoModule = await import('../crypto.js');
      if (safeConfig.apiKey) {
        safeConfig.apiKey = cryptoModule.encrypt(safeConfig.apiKey);
      }
      storedConfig = JSON.stringify(safeConfig);
    } catch {
      log.warn(`Failed to encrypt API key for model "${name}" — storing as-is`);
      storedConfig = JSON.stringify(safeConfig);
    }
    const result = modelRepo.create({ userId, name, adapterType: adapter_type, config: storedConfig });
    const { apiKey: _, ...returnConfig } = config || {};
    return { id: result.id, name, adapter_type, config: returnConfig };
  }

  delete(id, userId) {
    const result = modelRepo.delete(id, userId);
    if (result.changes === 0) throw new NotFoundError('Model not found');
  }

  startCacheRefresh(intervalMs = 30000) {
    if (this._timer) return;
    this._refreshCache();
    this._timer = setInterval(() => this._refreshCache(), intervalMs);
    this._timer.unref();
    log.info(`Background refresh started (interval: ${intervalMs}ms)`);
  }

  stopCacheRefresh() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

export const modelService = new ModelService();
