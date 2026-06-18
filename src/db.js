import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { config } from './config.js';

const DB_DIR = path.join(os.homedir(), '.localcanvas');
const DB_PATH = path.join(DB_DIR, 'localcanvas.db');

let db = null;

/**
 * Initialize the SQLite database and create all tables if they don't exist.
 */
export function initDatabase() {
  fs.ensureDirSync(DB_DIR);

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');  // wait up to 5s for other connections to release locks

  db.exec(`
    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_base ON knowledge_chunks(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_execution_logs_exec ON execution_logs(execution_id);

    -- Users table (multi-user support)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Workflows table
    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      nodes TEXT NOT NULL DEFAULT '[]',
      edges TEXT NOT NULL DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Model configurations
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      adapter_type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- API Key references (actual keys stored in system keychain via keytar)
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      key_ref TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Manual API endpoints
    CREATE TABLE IF NOT EXISTS apis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      headers TEXT DEFAULT '{}',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Knowledge bases
    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      last_indexed DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Knowledge chunks (vectors stored as JSON blob for simplicity)
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      knowledge_base_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      file_path TEXT,
      chunk_index INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
    );

    -- Execution records
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      workflow_id INTEGER,
      user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      start_time DATETIME,
      end_time DATETIME,
      output_files TEXT,
      error TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Execution logs
    CREATE TABLE IF NOT EXISTS execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (execution_id) REFERENCES executions(id)
    );

    -- Skill permissions
    CREATE TABLE IF NOT EXISTS skill_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      authorized BOOLEAN NOT NULL DEFAULT 0,
      authorized_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, skill_id)
    );

    -- Auto-discovered skills (from ~/.codex/skills/, ~/.agents/skills/, etc.)
    CREATE TABLE IF NOT EXISTS discovered_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      skill_path TEXT UNIQUE NOT NULL,
      version TEXT DEFAULT '1.0.0',
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Cron-based workflow schedules
    CREATE TABLE IF NOT EXISTS workflow_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      cron_expression TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT 1,
      last_run DATETIME,
      next_run DATETIME,
      user_id INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_schedules_enabled ON workflow_schedules(enabled);
  `);

  // Seed a default user if none exists (single-user mode)
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (userCount.count === 0) {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('default', '');
    console.log('[DB] Created default user (id=1)');
  }

  // 迁移系统
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)`);
  const currentVersion = db.prepare('SELECT MAX(version) AS v FROM schema_version').get()?.v || 0;

  const migrations = [
    // version 1: initial schema (already created above)
    { version: 2, sql: "ALTER TABLE executions ADD COLUMN results TEXT" },
    { version: 3, sql: "ALTER TABLE executions ADD COLUMN input_data TEXT" },
    {
      version: 4,
      sql: `
        CREATE TABLE IF NOT EXISTS workflow_schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id INTEGER NOT NULL,
          cron_expression TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT 1,
          last_run DATETIME,
          next_run DATETIME,
          user_id INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_workflow_schedules_enabled ON workflow_schedules(enabled);
      `,
    },
  ];

  for (const m of migrations) {
    if (m.version > currentVersion) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
      console.log(`[DB] Migration v${m.version} applied`);
    }
  }

  console.log(`[DB] Initialized at ${DB_PATH}`);
  return db;
}

/**
 * Get the database instance. Call initDatabase() first.
 */
/**
 * Clean up old execution records to prevent unlimited DB growth.
 * @param {number} keepExecutions - max execution records to retain (default 1000)
 * @param {number} keepLogs - max log entries to retain (default 10000)
 */
export function cleanupOldRecords(keepExecutions = config.db.cleanup.keepExecutions, keepLogs = config.db.cleanup.keepLogs) {
  try {
    const db = getDb();
    const execCount = db.prepare('SELECT COUNT(*) as c FROM executions').get()?.c || 0;
    if (execCount > keepExecutions) {
      const cutoff = db.prepare('SELECT id FROM executions ORDER BY start_time DESC LIMIT 1 OFFSET ?').get(keepExecutions);
      if (cutoff) {
        db.prepare("DELETE FROM execution_logs WHERE execution_id IN (SELECT id FROM executions WHERE start_time <= (SELECT start_time FROM executions WHERE id = ?))").run(cutoff.id);
        const deleted = db.prepare("DELETE FROM executions WHERE start_time <= (SELECT start_time FROM executions WHERE id = ?)").run(cutoff.id);
        console.log(`[DB] Cleaned ${deleted.changes} old execution records (kept ${keepExecutions})`);
      }
    }
    const logCount = db.prepare('SELECT COUNT(*) as c FROM execution_logs').get()?.c || 0;
    if (logCount > keepLogs) {
      const cutoffLog = db.prepare('SELECT id FROM execution_logs ORDER BY timestamp DESC LIMIT 1 OFFSET ?').get(keepLogs);
      if (cutoffLog) {
        const deletedLogs = db.prepare('DELETE FROM execution_logs WHERE id <= ?').run(cutoffLog.id);
        console.log(`[DB] Cleaned ${deletedLogs.changes} old log entries (kept ${keepLogs})`);
      }
    }
  } catch (e) { /* non-critical */ }
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Create a daily backup of the SQLite database.
 * Uses better-sqlite3's native backup API for a consistent snapshot
 * without needing to acquire exclusive locks.
 * Backups older than keepDays (default 30) are pruned.
 */
export function backupDatabase(keepDays = 30) {
  const backupDir = config.db.backupDir;
  fs.ensureDirSync(backupDir);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const backupPath = path.join(backupDir, `localcanvas-${dateStr}.db`);

  // Skip if today's backup already exists
  if (fs.existsSync(backupPath)) {
    return backupPath;
  }

  try {
    const source = getDb();
    source.backup(backupPath);
    console.log(`[DB] Backed up to ${backupPath}`);

    // Prune backups older than keepDays
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('localcanvas-') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .filter(f => f.mtime < cutoff);
    for (const f of files) {
      fs.removeSync(f.path);
      console.log(`[DB] Pruned old backup: ${f.name}`);
    }

    return backupPath;
  } catch (err) {
    console.error(`[DB] Backup failed: ${err.message}`);
    return null;
  }
}

/**
 * Close the database connection gracefully.
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export default { initDatabase, getDb, closeDatabase };
