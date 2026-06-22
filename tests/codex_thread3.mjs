import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

const db = new Database(path.join(os.homedir(), '.codex', 'state_5.sqlite'));

// Get the most recent thread (image/video generation)
const thread = db.prepare("SELECT id, title, first_user_message, created_at_ms FROM threads ORDER BY updated_at_ms DESC LIMIT 1").get();
console.log('=== 最新 Codex 线程 ===');
console.log('Title:', thread.title?.slice(0, 100));
console.log('User message:', thread.first_user_message?.slice(0, 1000));
console.log('Created:', new Date(thread.created_at_ms).toLocaleString());
console.log();

// Also get the rollout path to find the actual conversation
const thread2 = db.prepare("SELECT id, title, rollout_path, first_user_message FROM threads WHERE title LIKE '%免费%' OR title LIKE '%工作流%' ORDER BY updated_at_ms DESC LIMIT 3").all();
for (const t of thread2) {
  console.log('---');
  console.log('Title:', t.title?.slice(0, 100));
  console.log('Rollout:', t.rollout_path);
  console.log('Message:', t.first_user_message?.slice(0, 600));
}

db.close();
