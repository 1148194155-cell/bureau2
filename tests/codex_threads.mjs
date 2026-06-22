import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

const statePath = path.join(os.homedir(), '.codex', 'state_5.sqlite');
const db = new Database(statePath);

// Check threads for image/video related ones
const threads = db.prepare("SELECT thread_id, title, status, created_at_ms, updated_at_ms FROM threads ORDER BY updated_at_ms DESC LIMIT 10").all();
console.log('=== Codex 最近线程 ===');
for (const t of threads) {
  const created = new Date(t.created_at_ms).toLocaleString();
  const updated = new Date(t.updated_at_ms).toLocaleString();
  console.log(`  [${t.status}] ${t.title?.slice(0, 80) || '(no title)'}`);
  console.log(`    ID: ${t.thread_id?.slice(0, 20)}...`);
  console.log(`    创建: ${created} | 更新: ${updated}`);
}

db.close();
