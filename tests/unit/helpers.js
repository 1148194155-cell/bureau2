/**
 * Test helpers — create in-memory SQLite database with full schema.
 */
import Database from 'better-sqlite3';
import { vi } from 'vitest';

/**
 * Create an in-memory SQLite database with all required tables.
 * Returns the db instance. Also mocks getDb() from src/db.js.
 */
export function createTestDb() {
  const db = new Database(':memory:');

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      last_indexed DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS discovered_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      skill_path TEXT UNIQUE NOT NULL,
      version TEXT DEFAULT '1.0.0',
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      workflow_id INTEGER,
      user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      start_time DATETIME,
      end_time DATETIME,
      output_files TEXT,
      results TEXT,
      error TEXT,
      input_data TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (execution_id) REFERENCES executions(id)
    );

    CREATE TABLE IF NOT EXISTS workflow_vars (
      workflow_id INTEGER,
      execution_id TEXT,
      var_key TEXT NOT NULL,
      var_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workflow_id, execution_id, var_key)
    );
  `);

  // Seed default user
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('default', '');

  return db;
}

/**
 * Mock getDb() from the db module to return the given test db.
 * Call this before importing any repo that calls getDb().
 */
export function mockGetDb(testDb) {
  vi.mock('../db.js', () => ({
    getDb: () => testDb,
    default: { initDatabase: () => testDb, getDb: () => testDb },
  }));
}
