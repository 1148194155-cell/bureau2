import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

const db = new Database(path.join(os.homedir(), '.codex', 'state_5.sqlite'));
const threads = db.prepare("SELECT id, title, created_at_ms, updated_at_ms, first_user_message FROM threads ORDER BY updated_at_ms DESC LIMIT 8").all();
for (const t of threads) {
  console.log((t.title || '(no title)').slice(0, 80));
  if (t.first_user_message) console.log('  用户消息:', t.first_user_message.slice(0, 200));
  console.log('  更新:', new Date(t.updated_at_ms).toLocaleString());
  console.log();
}
db.close();
