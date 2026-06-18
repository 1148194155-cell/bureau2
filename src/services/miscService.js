/**
 * Misc Service — 健康检查 / Docker / Git / 扫描器 / 内置模型状态。
 * @since 2025-01 阶段2：从 misc route 提取。
 */
import { getDb } from '../db.js';
import { createAdapter } from '../models/adapter.js';
import { DEFAULT_MODEL_PATH } from '../models/builtinAdapter.js';
import { createLogger } from '../logger.js';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const log = createLogger('misc-service');

export class MiscService {
  async health() {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {},
    };
    try {
      const db = getDb();
      db.prepare('SELECT 1').get();
      health.checks.database = { status: 'ok' };
    } catch (err) {
      health.checks.database = { status: 'error', message: err.message };
      health.status = 'degraded';
    }
    try {
      const db = getDb();
      const model = db.prepare('SELECT * FROM models WHERE is_active = 1 LIMIT 1').get();
      if (model) {
        try {
          const adapter = createAdapter(model);
          const pingResult = await Promise.race([
            adapter.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
          ]);
          health.checks.adapter = { status: pingResult ? 'ok' : 'offline', model: model.name };
        } catch (err) {
          health.checks.adapter = { status: 'error', message: err.message, model: model.name };
        }
      }
    } catch {}
    return health;
  }

  async dockerStatus() {
    try {
      const { isDockerAvailable } = await import('../engine/dockerSandbox.js');
      const available = await isDockerAvailable();
      return { available, sandboxImage: 'localcanvas-sandbox' };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  builtinStatus() {
    const available = fs.existsSync(DEFAULT_MODEL_PATH);
    let info = { available, ready: false, error: null };
    if (available) {
      try {
        const stat = fs.statSync(DEFAULT_MODEL_PATH);
        info.fileSize = stat.size;
        info.ready = stat.size > 100 * 1024 * 1024;
      } catch {}
    }
    return { data: info };
  }

  async rescan() {
    // State handled in route for simplicity
    return { data: { status: 'idle' } };
  }

  async gitStatus() {
    try {
      const { execSync } = await import('node:child_process');
      let branch = 'unknown', lastCommit = 'N/A', status = '';
      try { branch = execSync('git branch --show-current', { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 }).trim(); } catch {}
      try { lastCommit = execSync('git log -1 --format="%h %s"', { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 }).trim(); } catch {}
      try { status = execSync('git status --short', { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 }).trim(); } catch {}
      return { data: { branch, lastCommit, status: status || '(clean)', filesChanged: status ? status.split('\n').length : 0 } };
    } catch (err) {
      return { error: 'Git not available: ' + err.message };
    }
  }

  async gitSave(message) {
    try {
      const { execSync } = await import('node:child_process');
      const msg = message || 'Auto-save workflow state';
      execSync('git add -A', { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 });
      execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 });
      const hash = execSync('git log -1 --format=%h', { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 }).trim();
      return { data: { commit: hash, message: msg } };
    } catch (err) {
      return { error: err.message.includes('nothing to commit') ? 'Nothing to commit (no changes)' : 'Git error: ' + err.message };
    }
  }
}

export const miscService = new MiscService();
