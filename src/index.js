import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { AppError } from './errors.js';
import { initDatabase, closeDatabase, backupDatabase } from './db.js';
import wsManager from './websocket.js';
import { autoDiscover } from './scanner/autoDiscover.js';
import apiRouter, { startModelsCacheRefresh, stopModelsCacheRefresh, startScheduler, stopScheduler } from './routes/api.js';
import { registerAdapter } from './models/adapter.js';
import logger from './logger.js';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// Ensure the __dirname equivalent for ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize

// Ensure base directories exist
fs.ensureDirSync(path.join(os.homedir(), '.localcanvas', 'skills'));
fs.ensureDirSync(path.join(os.homedir(), '.localcanvas', 'apis'));
fs.ensureDirSync(path.join(os.homedir(), '.localcanvas', 'keys'));

// Initialize database
const db = initDatabase();
autoDiscover(db).catch(err => {
  logger.error({ err }, 'Startup discovery failed');
});

// Register built-in model adapter — stub if node-llama-cpp not available
let builtinAvailable = false;
// Skipping node-llama-cpp import — blocks startup on systems without cmake
logger.info('Builtin model skipped — install node-llama-cpp + cmake to enable');
const { BaseModelAdapter } = await import('./models/adapter.js');
class StubBuiltin extends BaseModelAdapter {
  async chat() { throw new Error('内置模型不可用：node-llama-cpp 未安装。请改用 OpenAI/Ollama/Anthropic。'); }
  async embed() { throw new Error('内置模型不可用'); }
  async vision() { throw new Error('内置模型不可用：Vision 需要云端模型支持。'); }
  async ping() { return false; }
}
registerAdapter('builtin', StubBuiltin);

// Express App Setup

const app = express();

// Middleware
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
  /^file:\/\//,
  /^app:\/\//,       // Electron custom protocol
];

app.use(cors({
  origin: (origin, cb) => {
    // 同源请求（origin 为 undefined）放行
    if (!origin || ALLOWED_ORIGINS.some(pattern => pattern.test(origin))) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({ method: req.method, url: req.originalUrl, statusCode: res.statusCode, durationMs: duration },
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Routes

app.use('/api', apiRouter);

// Serve static frontend if available (for production build)
const frontendPath = path.join(__dirname, '..', 'public');
if (fs.pathExistsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  // SPA fallback: serve index.html for non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// Global Error Handler
app.use((err, req, res, _next) => {
  if (err instanceof AppError) {
    logger.warn({ err, code: err.code }, 'Application error');
    return res.status(err.httpStatus).json(err.toJSON());
  }
  // body-parser malformed JSON → return 400, not 500
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn({ err }, 'Malformed request body');
    return res.status(400).json({ success: false, error: 'Invalid JSON in request body', code: 'BAD_REQUEST' });
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL' });
});

// Create HTTP Server and attach WebSocket

const server = http.createServer(app);

// Initialize WebSocket on the same HTTP server
wsManager.init(server);

// Graceful Shutdown

function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  stopModelsCacheRefresh();
  stopScheduler();
  server.close(() => {
    closeDatabase();
    logger.info('Server closed. Goodbye!');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start Server

server.listen(config.server.port, config.server.host, () => {
  logger.info(`REST API  : http://${config.server.host}:${config.server.port}/api`);
  logger.info(`WebSocket : ws://${config.server.host}:${config.server.port}/ws`);
  logger.info(`Health    : http://${config.server.host}:${config.server.port}/api/health`);

  // Start background model status refresh
  startModelsCacheRefresh(30000);
  // Start workflow scheduler
  startScheduler(30000);

  // Daily database backup — run first backup immediately, then every 24h at 02:00
  backupDatabase();
  const msUntil2am = () => {
    const now = new Date();
    const target = new Date(now);
    target.setHours(2, 0, 0, 0);
    return target > now ? target - now : target - now + 86400000;
  };
  setTimeout(() => {
    setInterval(() => backupDatabase(), 86400000);
  }, msUntil2am());
  logger.info('DB backup: initial backup done, daily schedule at 02:00');
});

export default app;

