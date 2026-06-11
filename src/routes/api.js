import { Router } from 'express';
import { getDb } from '../db.js';
import { scanSkills, scanModels, scanApis, indexKnowledgeBase } from '../scanner/skillScanner.js';
import { executeWorkflow } from '../engine/executor.js';
import { createAdapter } from '../models/adapter.js';
import { DEFAULT_MODEL_PATH, BuiltinAdapter } from '../models/builtinAdapter.js';
import wsManager, { logExecution } from '../websocket.js';
import { handleChatMessage } from '../ai/chatHandler.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

const router = Router();

// 鈹€鈹€ Middleware 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * Simple auth middleware 鈥?uses user_id=1 as default for single-user mode.
 * In production, replace with JWT/session-based auth.
 */
function getUserId(req) {
  return parseInt(req.headers['x-user-id'], 10) || 1;
}

// 鈹€鈹€ Skill Routes 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * GET /api/skills 鈥?return all available skills.
 */
router.get('/skills', async (req, res) => {
  try {
    const db = getDb();
    const skills = await scanSkills();

    // Merge auto-discovered skills from the database
    const discovered = db.prepare(
      'SELECT name, description, skill_path, version FROM discovered_skills'
    ).all();

    for (const ds of discovered) {
      skills.push({
        id: `discovered:${ds.skill_path}`,
        name: ds.name,
        description: ds.description || '',
        version: ds.version || '1.0.0',
        input_schema: {},
        output_schema: {},
        source: 'discovered',
        path: ds.skill_path,
      });
    }

    res.json({ success: true, data: skills });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 鈹€鈹€ Model Routes 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * GET /api/models 鈥?return all models with online status.
 */
router.get('/models', async (req, res) => {
  try {
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

    // Ping each model to check status (non-blocking, best-effort)
    const modelsWithStatus = await Promise.all(
      deduped.map(async (m) => {
        let online = false;
        try {
          const adapter = createAdapter(m);
          online = await adapter.ping();
        } catch {
          // offline
        }
        return { ...m, online };
      })
    );

    // Strip apiKey from config before returning to frontend
    const safeModels = modelsWithStatus.map(m => {
      const config = typeof m.config === 'string' ? JSON.parse(m.config) : { ...m.config };
      delete config.apiKey;
      return { ...m, config };
    });

    res.json({ success: true, data: safeModels });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/models 鈥?add a new model configuration.
 * Body: { name, adapter_type, config: { endpoint, apiKey, model, ... } }
 */
router.post('/models', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/models/:id 鈥?remove a user-added model.
 */
router.delete('/models/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const result = db.prepare('DELETE FROM models WHERE id = ? AND user_id = ?')
      .run(req.params.id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 鈹€鈹€ API Routes 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * GET /api/apis 鈥?return all APIs (scanned + user-configured).
 */
router.get('/apis', async (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const apis = await scanApis(db, userId);
    res.json({ success: true, data: apis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/apis 鈥?add a manual API endpoint.
 */
router.post('/apis', (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/apis/:id
 */
router.delete('/apis/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const result = db.prepare('DELETE FROM apis WHERE id = ? AND user_id = ?')
      .run(req.params.id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'API not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 鈹€鈹€ Knowledge Base Routes 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * GET /api/knowledge 鈥?return all knowledge bases.
 */
router.get('/knowledge', (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const bases = db.prepare('SELECT * FROM knowledge_bases WHERE user_id = ?').all(userId);
    res.json({ success: true, data: bases });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/knowledge 鈥?create a knowledge base.
 * Body: { name, folder_path }
 */
router.post('/knowledge', (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/knowledge/:id/index 鈥?trigger re-indexing.
 * Body: { model_id } 鈥?the embedding model to use.
 */
router.post('/knowledge/:id/index', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/knowledge/:id
 */
router.delete('/knowledge/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const result = db.prepare('DELETE FROM knowledge_bases WHERE id = ? AND user_id = ?')
      .run(req.params.id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Knowledge base not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 鈹€鈹€ Workflow Routes 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * POST /api/workflows 鈥?save a workflow definition.
 * Body: { name, nodes, edges }
 */
router.post('/workflows', (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/workflows/:id 鈥?update a workflow definition.
 */
router.put('/workflows/:id', (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/workflows 鈥?list all workflows for the user.
 */
router.get('/workflows', (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const workflows = db.prepare(
      'SELECT id, name, created_at, updated_at FROM workflows WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(userId);

    res.json({ success: true, data: workflows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/workflows/:id 鈥?load a workflow definition with full nodes/edges.
 */
router.get('/workflows/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId);

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    const rawNodes = JSON.parse(workflow.nodes || '[]');
    const rawEdges = JSON.parse(workflow.edges || '[]');

    // Normalize node positions to { x, y } format
    const nodes = rawNodes.map(n => ({
      ...n,
      position: n.position || { x: n.position_x ?? 0, y: n.position_y ?? 0 },
    }));
    for (const n of nodes) {
      delete n.position_x;
      delete n.position_y;
    }

    const { user_id, ...safeWorkflow } = workflow;

    res.json({
      success: true,
      data: {
        ...safeWorkflow,
        nodes,
        edges: rawEdges,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/workflows/:id
 */
router.delete('/workflows/:id', (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 鈹€鈹€ Execution Routes 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * POST /api/workflows/run 鈥?execute a workflow.
 * Body: { workflow_id } or { nodes, edges } (inline definition)
 * Returns an execution_id for async progress tracking.
 */
router.post('/workflows/run', async (req, res) => {
  try {
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

    // Create execution record
    db.prepare(
      'INSERT INTO executions (id, workflow_id, user_id, status, start_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(executionId, workflow_id || null, userId, 'running');

    res.json({
      success: true,
      data: { execution_id: executionId },
    });

    // Execute asynchronously (non-blocking)
    executeWorkflowAsync(executionId, workflowDef, userId, db, options || {});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Execute a workflow asynchronously, updating DB and WebSocket as it goes.
 */
async function executeWorkflowAsync(executionId, workflowDef, userId, db, options) {
  const log = (level, message) => {
    logExecution(db, wsManager, executionId, level, message);
  };

  try {
    // Build skills map
    const skills = await scanSkills();

    // Merge DB-discovered SKILL.md skills (same as GET /api/skills)
    const discovered = db.prepare(
      'SELECT name, description, skill_path, version FROM discovered_skills'
    ).all();
    for (const ds of discovered) {
      skills.push({
        id: `discovered:${ds.skill_path}`,
        name: ds.name,
        description: ds.description || '',
        version: ds.version || '1.0.0',
        input_schema: {},
        output_schema: {},
        source: 'discovered',
        path: ds.skill_path,
      });
    }

    const skillsMap = {};
    for (const skill of skills) {
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

/**
 * GET /api/executions/:id/status 鈥?query execution status, logs, and results.
 */
router.get('/executions/:id/status', (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 鈹€鈹€ API Key Routes 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * POST /api/apikeys 鈥?save an API key.
 * Body: { name, api_key }
 * Stores the key via keytar (or falls back to encrypted env file), returns a ref id.
 */
router.post('/apikeys', async (req, res) => {
  try {
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
      // keytar unavailable (no system keychain) 鈥?store encrypted locally
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/apikeys 鈥?list API key references (never exposes the actual keys).
 */
router.get('/apikeys', (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const keys = db.prepare(
      'SELECT id, name, key_ref, created_at FROM api_keys WHERE user_id = ?'
    ).all(userId);

    res.json({ success: true, data: keys });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/apikeys/:id
 */
router.delete('/apikeys/:id', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 鈹€鈹€ AI Chat Route 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * POST /api/ai/chat 鈥?AI conversation with tool calling support.
 * Body: { message, history, canvas_state, model_id }
 *   - message: current user message
 *   - history: [{role, content}, ...]
 *   - canvas_state: { nodes, edges } (current canvas)
 *   - model_id: which model to use
 */
router.post('/ai/chat', async (req, res) => {
  try {
    const db = getDb();
    const userId = getUserId(req);
    const { message, history, canvas_state, model_id } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    // Find the model to use
    const modelId = model_id || 1;
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
      timeoutMs = 120000;  // builtin 2GB GGUF needs longer first-load time
    } else {
      model = db.prepare('SELECT * FROM models WHERE id = ? AND user_id = ?').get(modelId, userId);
      if (!model) {
        return res.status(400).json({ success: false, error: 'Model not found. Add a model first.' });
      }
    }

    const adapter = createAdapter(model);

    // Add timeout control
    const result = await Promise.race([
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

    res.json({ success: true, data: result });
  } catch (err) {
    // Distinguish timeout from other errors
    const status = err.message && err.message.includes('timed out') ? 504 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// 鈹€鈹€ Health Check 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// ── Built-in Model Status ──────────────────────────────────────────────────

router.get('/builtin/status', (req, res) => {
  const available = fs.existsSync(DEFAULT_MODEL_PATH);
  let info = { available, ready: false, error: null };
  if (available) {
    try {
      const stat = fs.statSync(DEFAULT_MODEL_PATH);
      info.fileSize = stat.size;
    } catch {}
  }
  res.json({ success: true, data: info });
});

// ── Health Check ───────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;


