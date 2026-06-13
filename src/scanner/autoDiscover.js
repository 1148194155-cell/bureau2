import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';

/**
 * Startup auto-discovery: scan local Codex skills, models, and APIs.
 * Runs once on server start, seeds the database with everything found.
 * All inserts use OR IGNORE for idempotency.
 */
export async function autoDiscover(db) {
  console.log('[AutoDiscover] Starting local resource discovery...');
  await discoverSkills(db);
  await discoverModels(db);
  await discoverApis(db);
  await discoverKnowledgeBases(db);
  console.log('[AutoDiscover] Done.');
}

// --- Skill Discovery ---

async function discoverSkills(db) {
  const sourceDirs = [
    path.join(os.homedir(), '.codex'),
    path.join(os.homedir(), '.agents'),
  ];

  const seen = new Set();

  async function walk(dir, depth) {
    if (depth <= 0) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const mdPath = path.join(fullPath, 'SKILL.md');
      if (await fs.pathExists(mdPath)) {
        try {
          const md = await fs.readFile(mdPath, 'utf8');
          const fm = parseFrontmatter(md);
          const name = fm.name || entry.name;
          if (seen.has(name)) continue;
          seen.add(name);
          ensureTable(db);
          db.prepare(
            'INSERT OR IGNORE INTO discovered_skills (name, description, skill_path, version) VALUES (?, ?, ?, ?)'
          ).run(name, fm.description || '', fullPath, fm.version || '1.0.0');
          console.log(`  + Skill: ${name}`);
        } catch (err) {
          console.warn(`  - Failed: ${entry.name}: ${err.message}`);
        }
      }
      await walk(fullPath, depth - 1);
    }
  }

  for (const dir of sourceDirs) {
    if (!(await fs.pathExists(dir))) continue;
    await walk(dir, 6);
  }
  console.log(`[AutoDiscover] Skills: ${seen.size} unique discovered`);
}

// --- Model Discovery ---

async function discoverModels(db) {
  const userId = 1;

  // Auto-detect Ollama
  try {
    const { execSync } = await import('node:child_process');
    const output = execSync('ollama list', { encoding: 'utf8', timeout: 2000 });
    const lines = output.trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 1) {
        const modelName = parts[0];
        const already = db.prepare(
          "SELECT id FROM models WHERE name = ? AND adapter_type = 'ollama' AND user_id = ?"
        ).get(modelName, userId);
        if (already) continue;

        console.log(`  + Model: ${modelName} (Ollama)`);
        db.prepare(
          'INSERT INTO models (user_id, name, adapter_type, config, is_active) VALUES (?, ?, ?, ?, 1)'
        ).run(userId, modelName, 'ollama', JSON.stringify({
          endpoint: 'http://localhost:11434',
          model: modelName,
        }));
      }
    }
  } catch {
    console.warn('[AutoDiscover] ollama not found or not running — skip');
  }

  // Auto-detect llama.cpp
  try {
    const res = await fetch('http://localhost:8080/health', {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const already = db.prepare(
        "SELECT id FROM models WHERE adapter_type = 'llamacpp' AND user_id = ?"
      ).get(userId);
      if (!already) {
        console.log('  + Model: llama.cpp (local)');
        db.prepare(
          'INSERT INTO models (user_id, name, adapter_type, config, is_active) VALUES (?, ?, ?, ?, 1)'
        ).run(userId, 'llama.cpp (local)', 'llamacpp', JSON.stringify({
          endpoint: 'http://localhost:8080',
          model: 'default',
        }));
      }
    }
  } catch {
    console.warn('[AutoDiscover] llama.cpp not reachable — skip');
  }

  // If still no models at all, seed a default entry so the UI isn't empty
  const total = db.prepare(
    'SELECT COUNT(*) as count FROM models WHERE user_id = ?'
  ).get(userId);
  if (total.count === 0) {
    console.log('  + Model: Default (OpenAI GPT-4o) — add your API key in Settings');
    db.prepare(
      'INSERT INTO models (user_id, name, adapter_type, config, is_active) VALUES (?, ?, ?, ?, 1)'
    ).run(userId, 'GPT-4o (default)', 'openai', JSON.stringify({
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiKey: '',
    }));
  }

  console.log(`[AutoDiscover] Models: ready`);
}

// --- API Discovery ---

async function discoverApis(db) {
  const apisDir = path.join(os.homedir(), '.localcanvas', 'apis');
  if (!(await fs.pathExists(apisDir))) return;

  const files = await fs.readdir(apisDir);
  let found = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== '.json' && ext !== '.yaml' && ext !== '.yml') continue;

    const filePath = path.join(apisDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      let spec;

      if (ext === '.json') {
        spec = JSON.parse(content);
      } else {
        spec = yaml.load(content);
      }

      if (!spec || !spec.info) continue;
      const name = spec.info.title || path.basename(file, ext);
      const url = spec.servers?.[0]?.url || `file://${filePath}`;

      const already = db.prepare('SELECT id FROM apis WHERE name = ?').get(name);
      if (already) continue;

      db.prepare(
        'INSERT INTO apis (user_id, name, url, method, headers, description) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(1, name, url, 'GET', '{}', spec.info.description || spec.info.title || name);
      found++;
      console.log(`  + API: ${name}`);
    } catch {
      // skip unparseable files
    }
  }
  if (found > 0) console.log(`[AutoDiscover] APIs: ${found} discovered`);
}

// --- Knowledge Base Discovery ---

async function discoverKnowledgeBases(db) {
  const rows = db.prepare('SELECT DISTINCT skill_path FROM discovered_skills').all();
  let count = 0;

  // 取一个可用模型做 embeddings
  const model = db.prepare('SELECT * FROM models WHERE is_active = 1 LIMIT 1').get();
  let embedFn = null;
  if (model) {
    try {
      const { createAdapter } = await import('../models/adapter.js');
      const adapter = createAdapter(model);
      embedFn = (texts) => adapter.embed(texts);
    } catch {
      console.warn('[AutoDiscover] Failed to create embedding adapter — indexing without embeddings');
    }
  }

  for (const row of rows) {
    const skillDir = row.skill_path;
    const name = path.basename(skillDir);
    const existing = db.prepare(
      'SELECT id, last_indexed FROM knowledge_bases WHERE name = ? AND user_id = ?'
    ).get(name, 1);

    let kbId;
    if (existing) {
      kbId = existing.id;
      if (existing.last_indexed) continue; // 已索引过，跳过
    } else {
      const result = db.prepare(
        'INSERT INTO knowledge_bases (user_id, name, folder_path) VALUES (?, ?, ?)'
      ).run(1, name, skillDir);
      kbId = result.lastInsertRowid;
    }

    count++;
    console.log(`  + Knowledge: ${name}`);

    // 自动索引（不阻塞启动，异步跑）
    if (embedFn) {
      const { indexKnowledgeBase } = await import('./skillScanner.js');
      indexKnowledgeBase(db, kbId, skillDir, embedFn).then(result => {
        console.log(`    -> Indexed ${name}: ${result?.totalChunks || 0} chunks`);
      }).catch(err => {
        console.warn(`    -> Index failed for ${name}: ${err.message}`);
      });
    }
  }
  console.log(`[AutoDiscover] Knowledge Bases: ${count} seeded`);
}

// --- Helpers ---

function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return yaml.load(match[1]) || {};
  } catch {
    return {};
  }
}


