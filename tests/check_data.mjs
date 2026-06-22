import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';

const dbPath = path.join(os.homedir(), '.localcanvas', 'localcanvas.db');
console.log('DB:', dbPath);
const db = new Database(dbPath);

// Latest executions
const execs = db.prepare('SELECT id, workflow_id, status, start_time, end_time, error, output_files, results FROM executions ORDER BY start_time DESC LIMIT 5').all();
console.log('\n=== 最新执行记录 ===');
for (const e of execs) {
  console.log('ID:', e.id?.slice(0, 20));
  console.log('  Workflow:', e.workflow_id, '| Status:', e.status);
  console.log('  Start:', e.start_time, '| End:', e.end_time);
  console.log('  Output:', (e.output_files || '').slice(0, 300));
  if (e.results) {
    const results = JSON.parse(e.results || '[]');
    console.log('  Results count:', results.length);
    for (const r of results) {
      console.log('    -', r.nodeName || r.nodeId, '| success:', r.success, r.error ? '| error: ' + r.error.slice(0, 100) : '');
      if (r.output?.filePath) console.log('      filePath:', r.output.filePath);
    }
  }
  console.log();
}

// All workflows with their names
const allWfs = db.prepare('SELECT id, name FROM workflows ORDER BY id DESC LIMIT 20').all();
console.log('\n=== 最近20个工作流 ===');
for (const w of allWfs) {
  console.log('  #' + w.id, ':', w.name);
}

db.close();
