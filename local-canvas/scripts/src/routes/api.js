import { Router } from 'express';
import { getDb } from '../db.js';
import { scanSkills, scanModels, scanApis, indexKnowledgeBase } from '../scanner/skillScanner.js';
import { executeWorkflow } from '../engine/executor.js';
import { createAdapter } from '../models/adapter.js';
import { DEFAULT_MODEL_PATH, BuiltinAdapter } from '../models/builtinAdapter.js';
import wsManager, { logExecution } from '../websocket.js';
import { handleChatMessage } from '../ai/chatHandler.js';
import { reviewPreExecution, reviewPostExecution } from '../review/reviewer.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

const router = Router();

// Scanner state tracking
let scannerStatus = 'idle';
let scannerLastScan = null; // ISO timestamp

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Middleware

/**
 * Simple auth middleware — uses user_id=1 as default for single-user mode.
 * In production, replace with JWT/session-based auth.
 */
function getUserId(req) {
  const raw = req.headers['x-user-id'];
  return raw ? parseInt(raw, 10) || 1 : 1;
}

function requireAuth(req, res, next) {
  const enableAuth = process.env.LC_ENABLE_AUTH === '1';
  if (!enableAuth) return next();

  const token = req.headers['x-auth-token'] || req.query.token;
  const expected = process.env.LC_AUTH_TOKEN;
  if (!expected) return next();

  if (token !== expected) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

router.use('/workflows', requireAuth);

// Skill Routes

/**
 * GET /api/skills — return all available skills.
 */
router.get('/skills', asyncHandler(async (req, res) => {
  const db = getDb();
  const skills = await buildSkillsList(db);
  res.json({ success: true, data: skills });
}));

// Model Routes

/**
 * GET /api/models — return all models with online status.
 */
router.get('/models', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const models = await scanModels(db, userId);

  // Deduplicate: if a user-created model has the same name as an auto-discovered
  // one, keep only the user-created version
  const userModelNames = new Set(
    models.filter(m => m.source === 'user').map(m => m.name)
  );
  const deduped = models.filter(m =>
    m.source === 'user' || !userModelNames.has(m.name)
  );

  // Ping each model to check status (non-blocking, best-effort, 3s timeout each)
  const modelsWithStatus = await Promise.all(
    deduped.map(async (m) => {
      let online = false;
      try {
        const adapter = createAdapter(m);
        online = await Promise.race([
          adapter.ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), 3000)),
        ]);
      } catch {
        // offline
      }
      return { ...m, online };
    })
  );

  // Strip apiKey from config before returning to frontend
  const safeModels = modelsWithStatus.map(m => {
    const config = m.config ? (typeof m.config === 'string' ? JSON.parse(m.config) : { ...m.config }) : {};
    delete config.apiKey;
    return { ...m, config };
  });

  res.json({ success: true, data: safeModels });
}));

/**
 * POST /api/models — add a new model configuration.
 * Body: { name, adapter_type, config: { endpoint, apiKey, model, ... } }
 */
router.post('/models', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const { name, adapter_type, config } = req.body;

  if (!name || !adapter_type) {
    return res.status(400).json({ success: false, error: 'name and adapter_type are required' });
  }

  // Encrypt apiKey before storing if present
  const safeConfig = { ...(config || {}) };
  let storedConfig;
  try {
    const crypto = await import('../crypto.js');
    if (safeConfig.apiKey) {
      safeConfig.apiKey = crypto.encrypt(safeConfig.apiKey);
    }
    storedConfig = JSON.stringify(safeConfig);
  } catch {
    console.warn(`[API] Failed to encrypt API key for model "${name}" — storing as-is`);
    storedConfig = JSON.stringify(safeConfig);
  }

  const result = db.prepare(
    'INSERT INTO models (user_id, name, adapter_type, config) VALUES (?, ?, ?, ?)'
  ).run(userId, name, adapter_type, storedConfig);

  // Return config without apiKey to frontend
  const { apiKey, ...returnConfig } = config || {};

  res.json({
    success: true,
    data: { id: result.lastInsertRowid, name, adapter_type, config: returnConfig },
  });
}));

/**
 * DELETE /api/models/:id — remove a user-added model.
 */
router.delete('/models/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const result = db.prepare('DELETE FROM models WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);

  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: 'Model not found' });
  }
  res.json({ success: true });
}));

// API Routes

/**
 * GET /api/apis — return all APIs (scanned + user-configured).
 */
router.get('/apis', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const apis = await scanApis(db, userId);
  res.json({ success: true, data: apis });
}));

/**
 * POST /api/apis — add a manual API endpoint.
 */
router.post('/apis', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const { name, url, method, headers, description } = req.body;

  if (!name || !url) {
    return res.status(400).json({ success: false, error: 'name and url are required' });
  }

  const result = db.prepare(
    'INSERT INTO apis (user_id, name, url, method, headers, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, name, url, method || 'GET', JSON.stringify(headers || {}), description || '');

  res.json({
    success: true,
    data: { id: result.lastInsertRowid, name, url, method },
  });
}));

/**
 * DELETE /api/apis/:id
 */
router.delete('/apis/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const result = db.prepare('DELETE FROM apis WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);

  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: 'API not found' });
  }
  res.json({ success: true });
}));

// Knowledge Base Routes

/**
 * GET /api/knowledge — return all knowledge bases.
 */
router.get('/knowledge', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const bases = db.prepare('SELECT id, user_id, name, folder_path, last_indexed, created_at FROM knowledge_bases WHERE user_id = ?').all(userId);
  res.json({ success: true, data: bases });
}));

/**
 * POST /api/knowledge — create a knowledge base.
 * Body: { name, folder_path }
 */
router.post('/knowledge', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const { name, folder_path } = req.body;

  if (!name || !folder_path) {
    return res.status(400).json({ success: false, error: 'name and folder_path are required' });
  }

  const result = db.prepare(
    'INSERT INTO knowledge_bases (user_id, name, folder_path) VALUES (?, ?, ?)'
  ).run(userId, name, folder_path);

  res.json({
    success: true,
    data: { id: result.lastInsertRowid, name, folder_path },
  });
}));

/**
 * POST /api/knowledge/:id/index — trigger re-indexing.
 * Body: { model_id } — the embedding model to use.
 */
router.post('/knowledge/:id/index', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const kb = db.prepare('SELECT * FROM knowledge_bases WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);

  if (!kb) {
    return res.status(404).json({ success: false, error: 'Knowledge base not found' });
  }

  // Load adapter for embeddings if model_id specified
  const { model_id } = req.body;
  let embedFn = null;
  if (model_id) {
    let embedModel;
    if (model_id === 'builtin') {
      embedModel = { id: 'builtin', name: '内置模型 (本地)', adapter_type: 'builtin', config: {} };
    } else {
      embedModel = db.prepare('SELECT * FROM models WHERE id = ? AND user_id = ?').get(model_id, userId);
    }
    if (embedModel) {
      const adapter = createAdapter(embedModel);
      embedFn = (texts) => adapter.embed(texts);
    }
  }

  const result = await indexKnowledgeBase(db, kb.id, kb.folder_path, embedFn);

  res.json({ success: true, data: result });
}));

/**
 * DELETE /api/knowledge/:id
 */
router.delete('/knowledge/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const result = db.prepare('DELETE FROM knowledge_bases WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);

  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: 'Knowledge base not found' });
  }
  res.json({ success: true });
}));

// Workflow Routes

/**
 * POST /api/workflows — save a workflow definition.
 * Body: { name, nodes, edges }
 */
router.post('/workflows', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const { name, nodes, edges } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'name is required' });
  }

  const result = db.prepare(
    'INSERT INTO workflows (user_id, name, nodes, edges) VALUES (?, ?, ?, ?)'
  ).run(userId, name, JSON.stringify(nodes || []), JSON.stringify(edges || []));

  res.json({
    success: true,
    data: { id: result.lastInsertRowid, name },
  });
}));

/**
 * PUT /api/workflows/:id — update a workflow definition.
 */
router.put('/workflows/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const { name, nodes, edges } = req.body;

  const existing = db.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Workflow not found' });
  }

  db.prepare(
    `UPDATE workflows SET name = ?, nodes = ?, edges = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
  ).run(
    name ?? existing.name,
    nodes ? JSON.stringify(nodes) : existing.nodes,
    edges ? JSON.stringify(edges) : existing.edges,
    req.params.id,
    userId
  );

  res.json({ success: true });
}));

/**
 * GET /api/workflows — list all workflows for the user.
 */
router.get('/workflows', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const workflows = db.prepare(
    'SELECT id, name, created_at, updated_at FROM workflows WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId);

  res.json({ success: true, data: workflows });
}));

/**
 * GET /api/workflows/:id — get a single workflow with nodes/edges.
 */
router.get('/workflows/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);

  if (!workflow) {
    return res.status(404).json({ success: false, error: 'Workflow not found' });
  }

  const nodes = JSON.parse(workflow.nodes || '[]');
  const rawEdges = JSON.parse(workflow.edges || '[]');
  const { nodes: _, edges: _e, ...safeWorkflow } = workflow;

  res.json({
    success: true,
    data: {
      ...safeWorkflow,
      nodes,
      edges: rawEdges,
    },
  });
}));

/**
 * DELETE /api/workflows/:id
 */
router.delete('/workflows/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);

  // Clean up related data first to avoid FK constraint errors
  db.prepare(
    'DELETE FROM execution_logs WHERE execution_id IN (SELECT id FROM executions WHERE workflow_id = ?)'
  ).run(req.params.id);
  db.prepare('DELETE FROM executions WHERE workflow_id = ?').run(req.params.id);
  // Now delete the workflow
  const result = db.prepare('DELETE FROM workflows WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);

  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: 'Workflow not found' });
  }
  res.json({ success: true });
}));

// Execution Routes

/**
 * POST /api/workflows/run — execute a workflow.
 * Body: { workflow_id } or { nodes, edges } (inline definition)
 * Returns an execution_id for async progress tracking.
 */
router.post('/workflows/run', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const { workflow_id, nodes, edges, options } = req.body;

  let workflowDef;

  if (workflow_id) {
    const stored = db.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(workflow_id, userId);
    if (!stored) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    workflowDef = {
      nodes: JSON.parse(stored.nodes || '[]'),
      edges: JSON.parse(stored.edges || '[]'),
    };
  } else if (nodes && edges) {
    workflowDef = { nodes, edges };
  } else {
    return res.status(400).json({
      success: false,
      error: 'Provide either workflow_id or nodes+edges',
    });
  }

  const executionId = uuidv4();

  const skillsList = await buildSkillsList(db);
  const activeModels = db.prepare(
    'SELECT * FROM models WHERE user_id = ? AND is_active = 1'
  ).all(userId);
  const preReview = reviewPreExecution(workflowDef, skillsList, activeModels);
  if (preReview.status === 'fail') {
    return res.status(422).json({ success: false, error: 'Workflow review failed', review: preReview });
  }

  // Create execution record
  db.prepare(
    'INSERT INTO executions (id, workflow_id, user_id, status, start_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
  ).run(executionId, workflow_id || null, userId, 'running');

  res.json({
    success: true,
    data: { execution_id: executionId },
  });

  const reviewJson = JSON.stringify(preReview);
  logExecution(db, wsManager, executionId, 'review', reviewJson);

  // Execute asynchronously (non-blocking)
  executeWorkflowAsync(executionId, workflowDef, userId, db, skillsList, options || {}).catch(err => {
    console.error('[API] Unhandled execution error:', err.message);
  });
}));

/**
 * Execute a workflow asynchronously, updating DB and WebSocket as it goes.
 */
async function executeWorkflowAsync(executionId, workflowDef, userId, db, skillsList, options) {
  const log = (level, message) => {
    logExecution(db, wsManager, executionId, level, message);
  };

  try {
    // Build skills map
    const skillsMap = {};
    for (const skill of skillsList) {
      if (skill.id) skillsMap[skill.id] = skill;
    }

    // Build adapters map from active models
    const models = db.prepare(
      'SELECT * FROM models WHERE user_id = ? AND is_active = 1'
    ).all(userId);
    const adaptersMap = {};
    for (const model of models) {
      try {
        adaptersMap[model.id] = createAdapter(model);
        log('debug', `Adapter created: id=${model.id}, type=${model.adapter_type}, name=${model.name}`);
      } catch (err) {
        log('warn', `Failed to create adapter for model "${model.name}": ${err.message}`);
      }
    }

    // Register builtin adapter (not in models table) for workflow use
    if (!adaptersMap['builtin']) {
      try {
        adaptersMap['builtin'] = createAdapter({
          id: 'builtin',
          name: '内置模型 (本地)',
          adapter_type: 'builtin',
          config: {},
        });
        log('debug', 'Adapter created: id=builtin, type=builtin, name=内置模型 (本地)');
      } catch (err) {
        log('warn', `Failed to create builtin adapter: ${err.message}`);
      }
    }

    log('info', `Starting execution ${executionId}`);

    const result = await executeWorkflow({
      workflow: workflowDef,
      skills: skillsMap,
      adapters: adaptersMap,
      onLog: log,
      options,
    });

    const postReview = reviewPostExecution(result.outputFiles || []);
    const postReviewJson = JSON.stringify(postReview);
    logExecution(db, wsManager, executionId, 'review', postReviewJson);

    // Update execution record
    db.prepare(
      'UPDATE executions SET status = ?, end_time = CURRENT_TIMESTAMP, output_files = ? WHERE id = ?'
    ).run(
      'completed',
      JSON.stringify(result.outputFiles || []),
      executionId
    );

    log('info', 'Execution completed successfully');
    wsManager.sendComplete(executionId, result);
  } catch (err) {
    log('error', `Execution failed: ${err.message}`);

    db.prepare(
      'UPDATE executions SET status = ?, end_time = CURRENT_TIMESTAMP, error = ? WHERE id = ?'
    ).run('failed', err.message, executionId);

    wsManager.sendError(executionId, err.message);
  }
}

async function buildSkillsList(db) {
  const skills = await scanSkills();
  const discovered = db.prepare(
    'SELECT name, description, skill_path, version FROM discovered_skills'
  ).all();
  for (const ds of discovered) {
    // 跳过已在 scanSkills 结果中的同名技能
    if (skills.some(s => s.id === ds.name)) continue;
    skills.push({
      id: `discovered:${ds.skill_path}`,
      name: ds.name,
      description: ds.description || '',
      path: ds.skill_path,
      entry: null,
      type: 'discovered',
    });
  }
  return skills;
}

/**
 * GET /api/executions/:id/status — query execution status, logs, and results.
 */
router.get('/executions/:id/status', asyncHandler(async (req, res) => {
  const db = getDb();
  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id);

  if (!execution) {
    return res.status(404).json({ success: false, error: 'Execution not found' });
  }

  const logs = db.prepare(
    'SELECT level, message, timestamp FROM execution_logs WHERE execution_id = ? ORDER BY id'
  ).all(req.params.id);

  res.json({
    success: true,
    data: {
      ...execution,
      output_files: execution.output_files ? JSON.parse(execution.output_files) : [],
      logs,
    },
  });
}));

// API Key Routes

/**
 * POST /api/apikeys — save an API key.
 * Body: { name, api_key }
 * Stores the key via keytar (or falls back to encrypted env file), returns a ref id.
 */
router.post('/apikeys', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const { name, api_key } = req.body;

  if (!name || !api_key) {
    return res.status(400).json({ success: false, error: 'name and api_key are required' });
  }

  const keyRef = `lc_${userId}_${name}_${Date.now()}`;

  // Try keytar first, fall back to encrypted file storage
  let stored = false;
  try {
    const keytar = await import('keytar');
    await keytar.default.setPassword('LocalCanvas', keyRef, api_key);
    stored = true;
  } catch {
    // keytar unavailable (no system keychain) — store encrypted locally
    const { encrypt } = await import('../crypto.js');
    const encrypted = encrypt(api_key);
    const keyDir = path.join(os.homedir(), '.localcanvas', 'keys');
    await fs.ensureDir(keyDir);
    await fs.writeFile(path.join(keyDir, `${keyRef}.enc`), encrypted, 'utf8');
    stored = true;
  }

  if (!stored) {
    return res.status(500).json({ success: false, error: 'Failed to store API key' });
  }

  const result = db.prepare(
    'INSERT INTO api_keys (user_id, name, key_ref) VALUES (?, ?, ?)'
  ).run(userId, name, keyRef);

  res.json({
    success: true,
    data: { id: result.lastInsertRowid, name, key_ref: keyRef },
  });
}));

/**
 * GET /api/apikeys — list API key references (never exposes the actual keys).
 */
router.get('/apikeys', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const keys = db.prepare(
    'SELECT id, name, key_ref, created_at FROM api_keys WHERE user_id = ?'
  ).all(userId);

  res.json({ success: true, data: keys });
}));

/**
 * DELETE /api/apikeys/:id
 */
router.delete('/apikeys/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const key = db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);

  if (!key) {
    return res.status(404).json({ success: false, error: 'API key not found' });
  }

  // Remove from keytar or filesystem
  try {
    const keytar = await import('keytar');
    await keytar.default.deletePassword('LocalCanvas', key.key_ref);
  } catch {
    const keyPath = path.join(os.homedir(), '.localcanvas', 'keys', `${key.key_ref}.enc`);
    await fs.remove(keyPath);
  }

  db.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

// AI Chat Route

/**
 * POST /api/ai/chat — AI conversation with tool calling support.
 * Body: { message, history, canvas_state, model_id }
 *   - message: current user message
 *   - history: [{role, content}, ...]
 *   - canvas_state: { nodes, edges } (current canvas)
 *   - model_id: which model to use
 */
router.post('/ai/chat', asyncHandler(async (req, res) => {
  const db = getDb();
  const userId = getUserId(req);
  const { message, history, canvas_state, model_id } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  // Find the model to use
  const modelId = model_id || 'builtin';
  let model;
  let timeoutMs = 60000;  // default 60s

  if (modelId === 'builtin') {
    // Check builtin model file exists
    const available = fs.existsSync(DEFAULT_MODEL_PATH);
    if (!available) {
      return res.status(400).json({
        success: false,
        error: '内置模型文件未找到，请确认 models/builtin.gguf 存在',
      });
    }
    model = { id: 'builtin', name: '内置模型 (本地)', adapter_type: 'builtin', config: {} };
    timeoutMs = 180000;  // builtin: 2GB GGUF first-load 30-40s + inference 10-30s, 3min total
  } else {
    model = db.prepare('SELECT * FROM models WHERE id = ? AND user_id = ?').get(modelId, userId);
    if (!model) {
      return res.status(400).json({ success: false, error: 'Model not found. Add a model first.' });
    }
  }

  const adapter = createAdapter(model);

  let result;
  try {
    result = await Promise.race([
      handleChatMessage({
        message,
        history: history || [],
        canvasState: canvas_state || { nodes: [], edges: [] },
        adapter,
        userId,
        db,
        lang: req.body.lang || 'zh',
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
      ),
    ]);
  } catch (err) {
    const errMsg = err.message || String(err);
    // Translate common error messages for Chinese users
    if (errMsg.includes('out of memory') || errMsg.includes('OOM')) {
      return res.status(500).json({ success: false, error: '模型加载内存不足，请关闭其他应用或使用更小的模型' });
    }
    if (errMsg.includes('unsupported') || errMsg.includes('architecture')) {
      return res.status(500).json({ success: false, error: '模型格式不支持，请下载 Qwen2.5-3B-Instruct-Q4_K_M.gguf 格式的模型文件' });
    }
    if (errMsg.includes('not found') || errMsg.includes('ENOENT')) {
      return res.status(500).json({ success: false, error: '模型文件缺失或损坏，请确认 models/builtin.gguf 存在' });
    }
    if (errMsg.includes('timed out')) {
      return res.status(504).json({ success: false, error: `模型响应超时(${Math.round(timeoutMs / 1000)}s)，请检查模型是否正常运行` });
    }
    if (errMsg.includes('Failed to create adapter') || errMsg.includes('Unknown adapter')) {
      return res.status(500).json({ success: false, error: '模型适配器初始化失败，请检查模型配置' });
    }
    return res.status(500).json({ success: false, error: `模型运行时错误: ${errMsg}` });
  }

  res.json({ success: true, data: result });
}));

// Built-in Model Status

router.get('/builtin/status', (req, res) => {
  const available = fs.existsSync(DEFAULT_MODEL_PATH);
  let info = { available, ready: false, error: null };
  if (available) {
    try {
      const stat = fs.statSync(DEFAULT_MODEL_PATH);
      info.fileSize = stat.size;
      // If the model file is large enough to be valid (>100MB), mark as potentially loadable
      info.ready = stat.size > 100 * 1024 * 1024;
    } catch {}
  }
  res.json({ success: true, data: info });
});

// Health Check

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Scanner Routes


/**
 * POST /api/scanner/rescan — trigger a rescan of skills/models/apis
 */
router.post('/scanner/rescan', asyncHandler(async (req, res) => {
  const db = getDb();
  if (scannerStatus === 'scanning') {
    return res.status(409).json({ success: false, error: 'Scanner is already running' });
  }
  scannerStatus = 'scanning';
  const { autoDiscover } = await import('../scanner/autoDiscover.js');
  try {
    await autoDiscover(db);
    scannerStatus = 'idle';
    scannerLastScan = new Date().toISOString();
    res.json({ success: true, data: { status: 'idle', lastScan: scannerLastScan } });
  } catch (err) {
    scannerStatus = 'error';
    scannerLastScan = new Date().toISOString();
    res.status(500).json({ success: false, error: err.message });
  }
}));

export default router;
