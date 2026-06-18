/**
 * Stats Service — 执行统计概览 + 节点类型统计数据。
 * @since 2025-01 阶段2：从 stats route 提取。
 */
import { getDb } from '../db.js';

export class StatsService {
  overview() {
    const db = getDb();
    const totalExecutions = db.prepare('SELECT COUNT(*) as c FROM executions').get()?.c || 0;
    const completed = db.prepare("SELECT COUNT(*) as c FROM executions WHERE status = 'completed'").get()?.c || 0;
    const failed = db.prepare("SELECT COUNT(*) as c FROM executions WHERE status = 'failed'").get()?.c || 0;
    const cancelled = db.prepare("SELECT COUNT(*) as c FROM executions WHERE status IN ('cancelled','stopped')").get()?.c || 0;

    const recent7Days = db.prepare(
      "SELECT date(start_time) as day, COUNT(*) as count, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM executions WHERE start_time >= datetime('now','-7 days') GROUP BY day ORDER BY day"
    ).all();

    const avgDuration = db.prepare(
      "SELECT AVG((julianday(end_time) - julianday(start_time)) * 86400000) as ms FROM executions WHERE status = 'completed' AND end_time IS NOT NULL"
    ).get()?.ms || 0;

    const topWorkflows = db.prepare(
      `SELECT w.name, COUNT(*) as exec_count,
              SUM(CASE WHEN e.status='completed' THEN 1 ELSE 0 END) as success_count
       FROM executions e LEFT JOIN workflows w ON e.workflow_id = w.id
       WHERE e.workflow_id IS NOT NULL
       GROUP BY e.workflow_id ORDER BY exec_count DESC LIMIT 10`
    ).all();

    const errorRate = db.prepare(
      "SELECT COUNT(*) as c FROM execution_logs WHERE level = 'error'"
    ).get()?.c || 0;

    return {
      data: {
        total: totalExecutions,
        completed, failed, cancelled,
        successRate: totalExecutions > 0 ? (completed / totalExecutions * 100).toFixed(1) + '%' : 'N/A',
        avgDurationMs: Math.round(avgDuration),
        totalErrors: errorRate,
        recent7Days,
        topWorkflows,
      },
    };
  }

  nodes() {
    const db = getDb();
    const logs = db.prepare(
      "SELECT message, level FROM execution_logs WHERE message LIKE '%执行完成%' ORDER BY id DESC LIMIT 5000"
    ).all();
    const nodeTypeCounts = {};
    for (const l of logs) {
      const m = l.message || '';
      const typeMatch = m.match(/✓\s+(\S+)_(\S+)/);
      if (typeMatch) {
        const type = typeMatch[1];
        nodeTypeCounts[type] = (nodeTypeCounts[type] || 0) + 1;
      }
    }
    return { data: { nodeTypeCounts, sampledLogs: logs.length } };
  }
}

export const statsService = new StatsService();
