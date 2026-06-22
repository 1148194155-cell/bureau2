import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

const home = os.homedir();

// Check codex goals
const goalsPath = path.join(home, '.codex', 'goals_1.sqlite');
if (fs.existsSync(goalsPath)) {
  const db = new Database(goalsPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('=== Codex Goals DB Tables ===');
  for (const t of tables) {
    const rows = db.prepare(`SELECT * FROM "${t.name}" ORDER BY rowid DESC LIMIT 5`).all();
    for (const r of rows) {
      const s = JSON.stringify(r);
      console.log(`[${t.name}]`, s.slice(0, 400));
    }
  }
  db.close();
} else {
  console.log('No goals db found at', goalsPath);
}

// Check memories
const memPath = path.join(home, '.codex', 'memories_1.sqlite');
if (fs.existsSync(memPath)) {
  const db = new Database(memPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\n=== Codex Memories DB Tables ===');
  for (const t of tables) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
    console.log(`Table: ${t.name} (${count.c} rows)`);
    if (count.c > 0) {
      const rows = db.prepare(`SELECT * FROM "${t.name}" ORDER BY rowid DESC LIMIT 3`).all();
      for (const r of rows) {
        const s = JSON.stringify(r);
        console.log(' ', s.slice(0, 500));
      }
    }
  }
  db.close();
}

// Check state
const statePath = path.join(home, '.codex', 'state_5.sqlite');
if (fs.existsSync(statePath)) {
  const db = new Database(statePath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\n=== Codex State DB Tables ===');
  for (const t of tables) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
    console.log(`Table: ${t.name} (${count.c} rows)`);
  }
  db.close();
}

// Also check generate_image.py
const genPy = path.join(process.cwd(), 'generate_image.py');
if (fs.existsSync(genPy)) {
  const content = fs.readFileSync(genPy, 'utf8');
  console.log('\n=== generate_image.py ===');
  console.log(content.slice(0, 2000));
}

console.log('\n=== output/ files ===');
const outputDir = path.join(process.cwd(), 'output');
if (fs.existsSync(outputDir)) {
  const files = fs.readdirSync(outputDir);
  for (const f of files) {
    const stat = fs.statSync(path.join(outputDir, f));
    console.log(`  ${f} (${(stat.size / 1024).toFixed(1)} KB) — ${stat.mtime}`);
  }
}
