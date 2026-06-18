/**
 * Scheduler Service — cron parsing, tick execution, timer lifecycle.
 * @since 2025-01 阶段4：从 workflowService 抽出，消除定时器管理与业务逻辑混在一起的问题。
 */
import { getDb, cleanupOldRecords } from '../db.js';
import { createLogger } from '../logger.js';

const log = createLogger('scheduler');

export class SchedulerService {
  constructor() {
    this._timer = null;
    this._running = false;
    /** @type {Function|null} callback(workflowDef, userId, db) => Promise<void> */
    this._onTick = null;
  }

  /** Register the callback fired for each due schedule. */
  setOnTick(fn) {
    this._onTick = fn;
  }

  // ── Cron helpers ──

  matchCronPart(part, value) {
    if (part === '*') return true;
    if (part.includes('/')) {
      const [, step] = part.split('/');
      return value % parseInt(step) === 0;
    }
    if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(part) === value;
  }

  parseCronNext(cronExpr, fromDate = new Date()) {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [min, hour, dom, month, dow] = parts;
    const next = new Date(fromDate);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    const maxIter = 7 * 24 * 60;
    for (let i = 0; i < maxIter; i++) {
      const m = next.getMinutes(), h = next.getHours(), d = next.getDate();
      const mo = next.getMonth() + 1, w = next.getDay();
      if (this.matchCronPart(min, m) && this.matchCronPart(hour, h) && this.matchCronPart(dom, d) && this.matchCronPart(month, mo) && this.matchCronPart(dow, w)) {
        return next;
      }
      next.setMinutes(next.getMinutes() + 1);
    }
    return null;
  }

  // ── Timer lifecycle ──

  async _tick() {
    if (this._running) return;
    this._running = true;
    try {
      const db = getDb();
      const now = new Date();
      const schedules = db.prepare(
        'SELECT s.*, w.nodes, w.edges FROM workflow_schedules s JOIN workflows w ON s.workflow_id = w.id WHERE s.enabled = 1 AND (s.next_run IS NULL OR s.next_run <= ?)'
      ).all(now.toISOString());
      for (const sched of schedules) {
        try {
          const workflowDef = { id: sched.workflow_id, nodes: JSON.parse(sched.nodes || '[]'), edges: JSON.parse(sched.edges || '[]') };
          if (this._onTick) {
            await this._onTick(workflowDef, sched);
          }
          const nextRun = this.parseCronNext(sched.cron_expression);
          db.prepare('UPDATE workflow_schedules SET last_run = CURRENT_TIMESTAMP, next_run = ? WHERE id = ?')
            .run(nextRun ? nextRun.toISOString() : null, sched.id);
        } catch (err) {
          log.warn({ err }, `Failed to run schedule ${sched.id}`);
        }
      }
    } catch (err) {
      log.warn({ err }, 'Scheduler tick failed');
    } finally {
      this._running = false;
      if (Math.random() < 0.05) {
        try { cleanupOldRecords(); } catch { /* non-critical */ }
      }
    }
  }

  start(intervalMs = 30000) {
    if (this._timer) return;
    this._tick();
    this._timer = setInterval(() => this._tick(), intervalMs);
    this._timer.unref();
    log.info(`Scheduler started (tick every ${intervalMs}ms)`);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

export const schedulerService = new SchedulerService();
export const parseCronNext = (expr, date) => schedulerService.parseCronNext(expr, date);
