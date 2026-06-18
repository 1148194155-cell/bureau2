/**
 * WorkflowRepo unit tests — in-memory SQLite.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let db;
let WorkflowRepo;

vi.mock('../../src/db.js', () => ({
  getDb: () => db,
}));

beforeEach(async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE workflows (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, nodes TEXT NOT NULL DEFAULT '[]', edges TEXT NOT NULL DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id));
  `);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('default', '');
  const mod = await import('../../src/repo/workflowRepo.js');
  WorkflowRepo = mod.WorkflowRepo;
});

afterEach(() => {
  if (db) { try { db.close(); } catch {} }
});

function createRepo() {
  return new WorkflowRepo();
}

describe('WorkflowRepo', () => {
  it('listByUser returns empty array when no workflows', () => {
    const repo = createRepo();
    expect(repo.listByUser(1)).toEqual([]);
  });

  it('create inserts a workflow and returns id', () => {
    const repo = createRepo();
    const result = repo.create({ userId: 1, name: 'Test', nodes: [{ id: 'a' }], edges: [] });
    expect(result.id).toBe(1);
  });

  it('getById returns the workflow for correct user', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'Test', nodes: [], edges: [] });
    const wf = repo.getById(1, 1);
    expect(wf).not.toBeNull();
    expect(wf.name).toBe('Test');
    expect(wf.user_id).toBe(1);
  });

  it('getById returns undefined for wrong user', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'Test', nodes: [], edges: [] });
    expect(repo.getById(1, 999)).toBeUndefined();
  });

  it('getById returns undefined for non-existent id', () => {
    const repo = createRepo();
    expect(repo.getById(999, 1)).toBeUndefined();
  });

  it('listByUser returns only workflows for the given user', () => {
    const repo = createRepo();
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('user2', '');
    repo.create({ userId: 1, name: 'User1 WF', nodes: [], edges: [] });
    repo.create({ userId: 2, name: 'User2 WF', nodes: [], edges: [] });
    const list = repo.listByUser(1);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('User1 WF');
  });

  it('update modifies name, nodes, edges', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'Original', nodes: [], edges: [] });
    repo.update(1, 1, { name: 'Updated', nodes: [{ id: 'x' }], edges: [{ source: 'x', target: 'y' }] });
    const wf = repo.getById(1, 1);
    expect(wf.name).toBe('Updated');
    expect(JSON.parse(wf.nodes)).toEqual([{ id: 'x' }]);
    expect(JSON.parse(wf.edges)).toEqual([{ source: 'x', target: 'y' }]);
  });

  it('update increments updated_at', async () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'T', nodes: [], edges: [] });
    const before = repo.getById(1, 1).updated_at;
    await new Promise(r => setTimeout(r, 1100)); // ensure timestamp differs
    repo.update(1, 1, { name: 'T2', nodes: [], edges: [] });
    const after = repo.getById(1, 1).updated_at;
    expect(after).not.toBe(before);
  });

  it('delete removes the workflow', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'ToDelete', nodes: [], edges: [] });
    repo.delete(1, 1);
    expect(repo.getById(1, 1)).toBeUndefined();
  });

  it('delete does nothing for wrong user', () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'T', nodes: [], edges: [] });
    repo.delete(1, 999);
    expect(repo.getById(1, 1)).not.toBeNull();
  });

  it('listByUser returns workflows ordered by updated_at DESC', async () => {
    const repo = createRepo();
    repo.create({ userId: 1, name: 'A', nodes: [], edges: [] });
    repo.create({ userId: 1, name: 'B', nodes: [], edges: [] });
    await new Promise(r => setTimeout(r, 1100)); // ensure timestamp differs
    // Update B to make it newer
    repo.update(2, 1, { name: 'B2', nodes: [], edges: [] });
    const list = repo.listByUser(1);
    expect(list[0].name).toBe('B2');
    expect(list[1].name).toBe('A');
  });
});
