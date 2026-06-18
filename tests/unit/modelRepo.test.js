/**
 * ModelRepo unit tests — in-memory SQLite.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let db;
let ModelRepo;

vi.mock('../../src/db.js', () => ({
  getDb: () => db,
}));

beforeEach(async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE models (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, adapter_type TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', is_active BOOLEAN NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id));
  `);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('default', '');
  const mod = await import('../../src/repo/modelRepo.js');
  ModelRepo = mod.ModelRepo;
});

afterEach(() => {
  if (db) { try { db.close(); } catch {} }
});

function createRepo() {
  return new ModelRepo();
}

describe('ModelRepo', () => {
  it('listByUser returns empty for new user', () => {
    expect(createRepo().listByUser(1)).toEqual([]);
  });

  it('create inserts model and returns id', () => {
    const r = createRepo().create({ userId: 1, name: 'GPT', adapterType: 'openai', config: '{"apiKey":"sk-test"}' });
    expect(r.id).toBe(1);
  });

  it('getById returns model for correct user', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'GPT', adapterType: 'openai', config: '{}' });
    const m = repo.getById(1, 1);
    expect(m).not.toBeNull();
    expect(m.name).toBe('GPT');
    expect(m.adapter_type).toBe('openai');
  });

  it('getById returns undefined for wrong user', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'GPT', adapterType: 'openai', config: '{}' });
    expect(repo.getById(1, 999)).toBeUndefined();
  });

  it('listByUser returns only models for the given user', () => {
    const repo = createRepo();
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('user2', '');
    repo.create({ userId: 1, name: 'M1', adapterType: 'openai', config: '{}' });
    repo.create({ userId: 2, name: 'M2', adapterType: 'ollama', config: '{}' });
    const list = repo.listByUser(1);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('M1');
  });

  it('listActiveByUser returns only active models', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'Active', adapterType: 'openai', config: '{}' });
    repo.create({ userId: 1, name: 'Inactive', adapterType: 'ollama', config: '{}' });
    db.prepare('UPDATE models SET is_active = 0 WHERE id = ?').run(2);
    const active = repo.listActiveByUser(1);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Active');
  });

  it('delete removes the model', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'ToDelete', adapterType: 'openai', config: '{}' });
    const result = repo.delete(1, 1);
    expect(result.changes).toBe(1);
    expect(repo.getById(1, 1)).toBeUndefined();
  });

  it('delete returns 0 changes for wrong user', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'T', adapterType: 'openai', config: '{}' });
    const result = repo.delete(1, 999);
    expect(result.changes).toBe(0);
  });
});
