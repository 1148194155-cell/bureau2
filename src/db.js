import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

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
  `);

  // Seed a default user if none exists (single-user mode)
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (userCount.count === 0) {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('default', '');
    console.log('[DB] Created default user (id=1)');
  }

  console.log(`[DB] Initialized at ${DB_PATH}`);
  return db;
}

/**
 * Get the database instance. Call initDatabase() first.
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
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
