/**
 * KnowledgeRepo unit tests — in-memory SQLite.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let db;
let KnowledgeRepo;

vi.mock('../../src/db.js', () => ({
  getDb: () => db,
}));

beforeEach(async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE knowledge_bases (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, folder_path TEXT NOT NULL, last_indexed DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id));
  `);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('default', '');
  const mod = await import('../../src/repo/knowledgeRepo.js');
  KnowledgeRepo = mod.KnowledgeRepo;
});

afterEach(() => {
  if (db) { try { db.close(); } catch {} }
});

function createRepo() {
  return new KnowledgeRepo();
}

describe('KnowledgeRepo', () => {
  it('listByUser returns empty for new user', () => {
    expect(createRepo().listByUser(1)).toEqual([]);
  });

  it('createBase inserts and returns id', () => {
    const r = createRepo().createBase({ userId: 1, name: 'Docs', folderPath: '/tmp/docs' });
    expect(r.id).toBe(1);
  });

  it('getBaseById returns base for correct user', () => {
    const repo = createRepo();
    repo.createBase({ userId: 1, name: 'Docs', folderPath: '/tmp/docs' });
    const kb = repo.getBaseById(1, 1);
    expect(kb).not.toBeNull();
    expect(kb.name).toBe('Docs');
    expect(kb.folder_path).toBe('/tmp/docs');
  });

  it('getBaseById returns undefined for wrong user', () => {
    const repo = createRepo();
    repo.createBase({ userId: 1, name: 'Docs', folderPath: '/tmp/docs' });
    expect(repo.getBaseById(1, 999)).toBeUndefined();
  });

  it('listByUser returns only bases for the given user', () => {
    const repo = createRepo();
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('user2', '');
    repo.createBase({ userId: 1, name: 'KB1', folderPath: '/tmp/kb1' });
    repo.createBase({ userId: 2, name: 'KB2', folderPath: '/tmp/kb2' });
    expect(repo.listByUser(1)).toHaveLength(1);
  });

  it('deleteBase removes the base', () => {
    const repo = createRepo();
    repo.createBase({ userId: 1, name: 'ToDelete', folderPath: '/tmp/del' });
    const result = repo.deleteBase(1, 1);
    expect(result.changes).toBe(1);
    expect(repo.getBaseById(1, 1)).toBeUndefined();
  });

  it('deleteBase returns 0 changes for wrong user', () => {
    const repo = createRepo();
    repo.createBase({ userId: 1, name: 'T', folderPath: '/tmp/t' });
    const result = repo.deleteBase(1, 999);
    expect(result.changes).toBe(0);
  });
});
