/**
 * ExecutionRepo unit tests — in-memory SQLite.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let db;
let ExecutionRepo;

vi.mock('../../src/db.js', () => ({
  getDb: () => db,
}));

beforeEach(async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE workflows (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, nodes TEXT DEFAULT '[]', edges TEXT DEFAULT '[]');
    CREATE TABLE executions (id TEXT PRIMARY KEY, workflow_id INTEGER, user_id INTEGER, status TEXT NOT NULL DEFAULT 'pending', start_time DATETIME, end_time DATETIME, output_files TEXT, results TEXT, error TEXT, FOREIGN KEY (workflow_id) REFERENCES workflows(id), FOREIGN KEY (user_id) REFERENCES users(id));
    CREATE TABLE execution_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, execution_id TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info', message TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (execution_id) REFERENCES executions(id));
  `);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('default', '');
  db.prepare('INSERT INTO workflows (user_id, name) VALUES (?, ?)').run(1, 'Test');
  const mod = await import('../../src/repo/executionRepo.js');
  ExecutionRepo = mod.ExecutionRepo;
});

afterEach(() => {
  if (db) { try { db.close(); } catch {} }
});

function createRepo() {
  return new ExecutionRepo();
}

describe('ExecutionRepo', () => {
  it('getById returns undefined for missing execution', () => {
    expect(createRepo().getById('nonexistent')).toBeUndefined();
  });

  it('create inserts execution with start_time', () => {
    createRepo().create({ id: 'exec-1', workflowId: 1, userId: 1, status: 'running' });
    const exec = createRepo().getById('exec-1');
    expect(exec).not.toBeNull();
    expect(exec.status).toBe('running');
    expect(exec.start_time).not.toBeNull();
  });

  it('getStatusById returns only status field', () => {
    const repo = createRepo();
    repo.create({ id: 'e1', workflowId: 1, userId: 1, status: 'pending' });
    const row = repo.getStatusById('e1');
    expect(row.status).toBe('pending');
    expect(Object.keys(row)).toEqual(['status']);
  });

  it('updateStatus changes status', () => {
    const repo = createRepo();
    repo.create({ id: 'e1', workflowId: 1, userId: 1, status: 'running' });
    repo.updateStatus('e1', 'completed', { endTime: new Date().toISOString() });
    const exec = repo.getById('e1');
    expect(exec.status).toBe('completed');
    expect(exec.end_time).not.toBeNull();
  });

  it('updateStatus with error', () => {
    const repo = createRepo();
    repo.create({ id: 'e1', workflowId: 1, userId: 1, status: 'running' });
    repo.updateStatus('e1', 'failed', { error: 'Something went wrong' });
    const exec = repo.getById('e1');
    expect(exec.status).toBe('failed');
    expect(exec.error).toBe('Something went wrong');
  });

  it('complete marks execution as completed with output', () => {
    const repo = createRepo();
    repo.create({ id: 'e1', workflowId: 1, userId: 1, status: 'running' });
    repo.complete('e1', { outputFiles: [{ path: '/tmp/out.json' }], results: [{ nodeId: 'a', success: true }] });
    const exec = repo.getById('e1');
    expect(exec.status).toBe('completed');
    expect(JSON.parse(exec.output_files)).toEqual([{ path: '/tmp/out.json' }]);
  });

  it('fail sets status and error', () => {
    const repo = createRepo();
    repo.create({ id: 'e1', workflowId: 1, userId: 1, status: 'running' });
    repo.fail('e1', 'Boom!');
    const exec = repo.getById('e1');
    expect(exec.status).toBe('failed');
    expect(exec.error).toBe('Boom!');
  });

  it('addLog inserts a log entry', () => {
    const repo = createRepo();
    repo.create({ id: 'e1', workflowId: 1, userId: 1, status: 'running' });
    repo.addLog({ executionId: 'e1', level: 'info', message: 'Started' });
    repo.addLog({ executionId: 'e1', level: 'error', message: 'Failed' });
    const logs = repo.getLogs('e1');
    expect(logs).toHaveLength(2);
    expect(logs[0].level).toBe('info');
    expect(logs[1].level).toBe('error');
  });

  it('getLogs returns empty for unknown execution', () => {
    expect(createRepo().getLogs('none')).toEqual([]);
  });

  it('listHistoryByWorkflow returns executions in reverse order', async () => {
    const repo = createRepo();
    repo.create({ id: 'e1', workflowId: 1, userId: 1, status: 'completed' });
    await new Promise(r => setTimeout(r, 1100)); // ensure timestamp differs
    repo.create({ id: 'e2', workflowId: 1, userId: 1, status: 'failed' });
    const history = repo.listHistoryByWorkflow(1);
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe('e2');
    expect(history[0].log_count).toBe(0);
  });

  it('listHistoryByWorkflow enforces max limit of 100', () => {
    const repo = createRepo();
    for (let i = 0; i < 5; i++) {
      repo.create({ id: `e${i}`, workflowId: 1, userId: 1, status: 'done' });
    }
    const history = repo.listHistoryByWorkflow(1, 3);
    expect(history).toHaveLength(3);
  });

  it('deleteByWorkflow removes executions and logs', () => {
    const repo = createRepo();
    repo.create({ id: 'e1', workflowId: 1, userId: 1, status: 'done' });
    repo.addLog({ executionId: 'e1', level: 'info', message: 'x' });
    repo.deleteByWorkflow(1);
    expect(repo.getById('e1')).toBeUndefined();
    expect(repo.getLogs('e1')).toEqual([]);
  });
});
