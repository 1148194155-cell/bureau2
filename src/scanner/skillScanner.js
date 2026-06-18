import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { DEFAULT_MODEL_PATH } from '../models/builtinAdapter.js';
import { execSync } from 'node:child_process';

const SKILLS_DIR = path.join(os.homedir(), '.localcanvas', 'skills');
const APIS_DIR = path.join(os.homedir(), '.localcanvas', 'apis');

// --- Skill Scanning ---

/**
 * Scan the ~/.localcanvas/skills/ directory and parse every skill.json.
 * Each subdirectory with a valid skill.json is treated as a skill.
 * @returns {Promise<Array<{id:string, name:string, description:string, version:string, entry:string|null, entryType:string, permissions:string[], input_schema:object, output_schema:object, author:string, icon:string, path:string}>>}
 */
export async function scanSkills() {
  await fs.ensureDir(SKILLS_DIR);

  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillJsonPath = path.join(SKILLS_DIR, entry.name, 'skill.json');
    if (!(await fs.pathExists(skillJsonPath))) continue;

    try {
      const skill = await fs.readJson(skillJsonPath);
      skills.push({
        id: skill.id || entry.name,
        name: skill.name || entry.name,
        description: skill.description || '',
        version: skill.version || '1.0.0',
        entry: skill.entry || null,
        entryType: skill.entryType || 'python', // python | node | shell
        permissions: skill.permissions || [],
        input_schema: skill.input_schema || skill.parameters || [],
        output_schema: skill.output_schema || [],
        author: skill.author || '',
        icon: skill.icon || '',
        path: path.join(SKILLS_DIR, entry.name),
      });
    } catch (err) {
      console.warn(`[Scanner] Failed to parse skill ${entry.name}: ${err.message}`);
    }
  }

  return skills;
}

// --- Model Scanning ---

// ── Model scan cache (60s TTL to avoid blocking on ollama list) ──

let _modelCache = null;
let _modelCacheTime = 0;
const MODEL_CACHE_TTL = 60000;

/**
 * Auto-detect local model providers and merge with user-configured models.
 * @param {import('../db.js').Database} db - Database instance
 * @param {number} userId - User ID
 */
export async function scanModels(db, userId = 1) {
  // Use cache within TTL
  if (_modelCache && (Date.now() - _modelCacheTime) < MODEL_CACHE_TTL) {
    return _modelCache;
  }
  const models = [];

  // 0. Check for built-in model (shipped in models/builtin.gguf)
  if (fs.existsSync(DEFAULT_MODEL_PATH)) {
    models.push({
      id: 'builtin',
      name: '内置模型 (本地)',
      adapter_type: 'builtin',
      config: {},
      is_active: true,
      source: 'builtin',
      online: true,
    });
  }


  // 1. Auto-detect Ollama
  try {
    const output = execSync('ollama list', { encoding: 'utf8', timeout: 2000 });
    const lines = output.trim().split('\n').slice(1); // skip header
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 1) {
        models.push({
          id: `auto:ollama:${parts[0]}`,
          name: parts[0],
          adapter_type: 'ollama',
          config: { endpoint: 'http://localhost:11434', model: parts[0] },
          is_active: true,
          source: 'auto',
        });
      }
    }
  } catch {
    console.warn('[Scanner] ollama not available (not installed or not running)');
  }

  // 2. Auto-detect llama.cpp server (default port 8080)
  try {
    const res = await fetch('http://localhost:8080/health', {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      models.push({
        id: 'auto:llamacpp',
        name: 'llama.cpp (local)',
        adapter_type: 'llamacpp',
        config: { endpoint: 'http://localhost:8080', model: 'default' },
        is_active: true,
        source: 'auto',
      });
    }
  } catch {
    // llama.cpp not available
    console.warn('[Scanner] llama.cpp server not reachable');
  }

  // 3. Merge user-configured models from DB
  const userModels = db.prepare(
    'SELECT id, name, adapter_type, config, is_active FROM models WHERE user_id = ?'
  ).all(userId);

  for (const m of userModels) {
    models.push({
      id: m.id,
      name: m.name,
      adapter_type: m.adapter_type,
      config: JSON.parse(m.config || '{}'),
      is_active: !!m.is_active,
      source: 'user',
    });
  }

  _modelCache = models;
  _modelCacheTime = Date.now();
  return models;
}

// --- API Scanning ---

// ── API scan cache (60s TTL) ──

let _apiCache = null;
let _apiCacheTime = 0;
const API_CACHE_TTL = 60000;

/**
 * Scan ~/.localcanvas/apis/ for OpenAPI files and merge with user-configured APIs.
 * @param {import('../db.js').Database} db
 * @param {number} userId
 */
export async function scanApis(db, userId = 1) {
  if (_apiCache && (Date.now() - _apiCacheTime) < API_CACHE_TTL) {
    return _apiCache;
  }
  const apis = [];

  // Scan filesystem for OpenAPI specs
  await fs.ensureDir(APIS_DIR);
  const files = await fs.readdir(APIS_DIR);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
      try {
        const content = await fs.readFile(path.join(APIS_DIR, file), 'utf8');
        const spec = ext === '.json' ? JSON.parse(content) : yaml.load(content);
        apis.push({
          name: spec.info?.title || file,
          sourceFile: file,
          spec,
          source: 'file',
        });
      } catch {
        console.warn(`[Scanner] Failed to parse API file: ${file}`);
      }
    }
  }

  // Merge user-configured APIs from DB
  const userApis = db.prepare(
    'SELECT id, name, url, method, headers, description FROM apis WHERE user_id = ?'
  ).all(userId);

  for (const a of userApis) {
    apis.push({
      id: a.id,
      name: a.name,
      url: a.url,
      method: a.method,
      headers: JSON.parse(a.headers || '{}'),
      description: a.description,
      source: 'user',
    });
  }

  _apiCache = apis;
  _apiCacheTime = Date.now();
  return apis;
}

// --- Knowledge Base Scanning ---

/**
 * Scan a folder, extract text (placeholder), chunk it, and store embeddings.
 * For production, replace the placeholder extraction with actual file parsers.
 * @param {import('../db.js').Database} db
 * @param {number} knowledgeBaseId
 * @param {string} folderPath
 * @param {Function} embedFn - async function(texts) => number[][]
 */
export async function indexKnowledgeBase(db, knowledgeBaseId, folderPath, embedFn) {
  await fs.ensureDir(folderPath);

  const files = [];
  await collectTextFiles(folderPath, files);

  // Clear old chunks for this knowledge base
  db.prepare('DELETE FROM knowledge_chunks WHERE knowledge_base_id = ?').run(knowledgeBaseId);

  const insert = db.prepare(
    'INSERT INTO knowledge_chunks (knowledge_base_id, content, embedding, file_path, chunk_index) VALUES (?, ?, ?, ?, ?)'
  );

  const allTexts = [];
  const allMetadata = [];

  for (const filePath of files) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      let content;

      if (ext === '.pdf') {
        content = await extractPdfText(filePath);
      } else if (ext === '.docx') {
        content = await extractDocxText(filePath);
      } else if (ext === '.xlsx' || ext === '.xls') {
        content = await extractXlsxText(filePath);
      } else if (ext === '.html' || ext === '.htm') {
        const raw = await fs.readFile(filePath, 'utf8');
        content = stripHtml(raw);
      } else {
        content = await fs.readFile(filePath, 'utf8');
      }

      if (!content || !content.trim()) continue;

      const chunks = chunkText(content, 500, 50);
      for (let i = 0; i < chunks.length; i++) {
        allTexts.push(chunks[i]);
        allMetadata.push({ filePath, chunkIndex: i });
      }
    } catch (err) {
      console.warn(`[Scanner] Failed to read knowledge file: ${filePath} — ${err.message}`);
    }
  }

  // Generate embeddings in batches
  const BATCH_SIZE = 20;
  for (let i = 0; i < allTexts.length; i += BATCH_SIZE) {
    const batch = allTexts.slice(i, i + BATCH_SIZE);
    const metadataBatch = allMetadata.slice(i, i + BATCH_SIZE);

    let embeddings = [];
    if (embedFn && batch.length > 0) {
      try {
        embeddings = await embedFn(batch);
      } catch (err) {
        console.warn(`[Scanner] Embedding failed for batch ${i}: ${err.message}`);
        embeddings = batch.map(() => null);
      }
    } else {
      embeddings = batch.map(() => null);
    }

    const tx = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        insert.run(
          knowledgeBaseId,
          batch[j],
          embeddings[j] ? JSON.stringify(embeddings[j]) : null,
          metadataBatch[j].filePath,
          metadataBatch[j].chunkIndex
        );
      }
    });
    tx();
  }

  // Update last indexed timestamp
  db.prepare('UPDATE knowledge_bases SET last_indexed = CURRENT_TIMESTAMP WHERE id = ?')
    .run(knowledgeBaseId);

  return { totalChunks: allTexts.length };
}

// --- Helpers ---

/**
 * Recursively collect text and document files from a directory.
 * @param {string} dir - Directory to scan
 * @param {string[]} result - Accumulator array for file paths
 */
async function collectTextFiles(dir, result) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.')) {
        await collectTextFiles(fullPath, result);
      }
    } else if (isSupportedFile(entry.name)) {
      result.push(fullPath);
    }
  }
}

/**
 * Check if a filename is a supported text or document format.
 */
function isSupportedFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return [
    '.txt', '.md', '.json', '.yaml', '.yml', '.js', '.py', '.html', '.htm',
    '.css', '.xml', '.csv', '.log', '.sh', '.env', '.cfg', '.ini', '.toml',
    '.pdf', '.docx', '.xlsx', '.xls',
  ].includes(ext);
}

/**
 * Simple text chunking: split text into overlapping chunks.
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {string[]}
 */
export function chunkText(text, chunkSize, overlap) {
  if (text.length <= chunkSize) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;
    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }

    // Try to break at a newline or space
    const breakChars = ['\n', '. ', '! ', '? ', ', ', ' '];
    let breakAt = end;
    for (const ch of breakChars) {
      const idx = text.lastIndexOf(ch, end);
      if (idx > start + chunkSize / 2) {
        breakAt = idx + ch.length;
        break;
      }
    }

    chunks.push(text.slice(start, breakAt));
    start = breakAt - overlap;
    if (start < 0) start = 0;
  }

  return chunks;
}

// ── Document Format Parsers ──

/**
 * Extract text from a PDF file.
 */
async function extractPdfText(filePath) {
  let pdfParse;
  try {
    pdfParse = (await import('pdf-parse')).default;
  } catch {
    throw new Error('pdf-parse not installed. Run: npm install pdf-parse');
  }
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text || '';
}

/**
 * Extract text from a DOCX file.
 */
async function extractDocxText(filePath) {
  let mammoth;
  try {
    mammoth = (await import('mammoth')).default;
  } catch {
    throw new Error('mammoth not installed. Run: npm install mammoth');
  }
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/**
 * Extract text from an Excel file (xlsx/xls).
 */
async function extractXlsxText(filePath) {
  let XLSX;
  try {
    XLSX = (await import('xlsx')).default;
  } catch {
    throw new Error('xlsx not installed. Run: npm install xlsx');
  }
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    return XLSX.utils.sheet_to_csv(sheet);
  });
  return sheets.join('\n\n--- Sheet ---\n\n');
}

/**
 * Strip HTML tags and extract readable text.
 */
function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, '\n')
    .trim();
}

export default { scanSkills, scanModels, scanApis, indexKnowledgeBase, chunkText, extractPdfText, extractDocxText, stripHtml };

