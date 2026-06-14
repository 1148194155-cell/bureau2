import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { initDatabase, closeDatabase } from './db.js';
import wsManager from './websocket.js';
import { autoDiscover } from './scanner/autoDiscover.js';
import apiRouter from './routes/api.js';
import { registerAdapter } from './models/adapter.js';
import { BuiltinAdapter } from './models/builtinAdapter.js';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Configuration

const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

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
  console.error('[AutoDiscover] Startup discovery failed:', err.message);
});

// Register built-in model adapter — 原生的可编译也可能失败，不阻塞启动
let builtinAvailable = false;
try {
  const { getLlama } = await import('node-llama-cpp');
  builtinAvailable = true;
  registerAdapter('builtin', BuiltinAdapter);
} catch (err) {
  console.warn('[Server] node-llama-cpp unavailable — builtin model disabled');
  console.warn('  Install with: npm install node-llama-cpp');
  console.warn('  Or use OpenAI / Ollama / Anthropic models instead');
  const { BaseModelAdapter } = await import('./models/adapter.js');
  class StubBuiltin extends BaseModelAdapter {
    async chat() { throw new Error('内置模型不可用：node-llama-cpp 未安装或编译失败。请改用 OpenAI/Ollama/Anthropic 模型。'); }
    async embed() { throw new Error('内置模型不可用'); }
    async ping() { return false; }
  }
  registerAdapter('builtin', StubBuiltin);
}

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
    console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
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
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Create HTTP Server and attach WebSocket

const server = http.createServer(app);

// Initialize WebSocket on the same HTTP server
wsManager.init(server);

// Graceful Shutdown

function shutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    closeDatabase();
    console.log('[Server] Closed. Goodbye!');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown fails
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start Server

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('=== Local Canvas Backend Server ===');
  console.log(`  REST API  : http://${HOST}:${PORT}/api`);
  console.log(`  WebSocket : ws://${HOST}:${PORT}/ws`);
  console.log(`  Health    : http://${HOST}:${PORT}/api/health`);
  console.log('');
});

export default app;
