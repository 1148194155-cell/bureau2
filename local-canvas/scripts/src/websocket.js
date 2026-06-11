import { WebSocketServer } from 'ws';
import { getDb } from './db.js';

/**
 * WebSocket Manager for execution logging and real-time updates.
 */

class WebSocketManager {
  constructor() {
    this.wss = null;
    /** Map<execution_id, Set<WebSocket>> */
    this.subscriptions = new Map();
    /** Map<WebSocket, Set<execution_id>> */
    this.clientSubscriptions = new Map();
  }

  /**
   * Initialize the WebSocket server on top of an HTTP server.
   * @param {import('http').Server} server
   */
  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      console.log('[WS] Client connected');

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === 'subscribe') {
            const execId = msg.execution_id;
            if (!execId) {
              ws.send(JSON.stringify({ type: 'error', error: 'Missing execution_id' }));
              return;
            }

            // Track subscription
            if (!this.subscriptions.has(execId)) {
              this.subscriptions.set(execId, new Set());
            }
            this.subscriptions.get(execId).add(ws);

            if (!this.clientSubscriptions.has(ws)) {
              this.clientSubscriptions.set(ws, new Set());
            }
            this.clientSubscriptions.get(ws).add(execId);

            ws.send(JSON.stringify({
              type: 'subscribed',
              execution_id: execId,
            }));

            // Send existing logs from DB
            sendExistingLogs(ws, execId);
          }

          if (msg.type === 'unsubscribe') {
            const execId = msg.execution_id;
            unsubscribe(this, ws, execId);
          }
        } catch {
          ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
        }
      });

      ws.on('close', () => {
        // Clean up all subscriptions for this client
        const subs = this.clientSubscriptions.get(ws);
        if (subs) {
          for (const execId of subs) {
            const set = this.subscriptions.get(execId);
            if (set) {
              set.delete(ws);
              if (set.size === 0) this.subscriptions.delete(execId);
            }
          }
        }
        this.clientSubscriptions.delete(ws);
        console.log('[WS] Client disconnected');
      });

      ws.on('error', (err) => {
        console.warn('[WS] Client error:', err.message);
      });
    });

    console.log('[WS] WebSocket server initialized at /ws');
  }

  /**
   * Send a log message to all subscribers of an execution.
   */
  sendLog(executionId, level, message) {
    const subscribers = this.subscriptions.get(executionId);
    if (!subscribers || subscribers.size === 0) return;

    const payload = JSON.stringify({
      type: 'log',
      data: {
        level,
        message,
        timestamp: new Date().toISOString(),
      },
    });

    for (const ws of subscribers) {
      if (ws.readyState === 1) { // OPEN
        ws.send(payload);
      }
    }
  }

  /**
   * Send execution completion to all subscribers.
   */
  sendComplete(executionId, result) {
    const subscribers = this.subscriptions.get(executionId);
    if (!subscribers) return;

    const payload = JSON.stringify({
      type: 'complete',
      execution_id: executionId,
      result,
    });

    for (const ws of subscribers) {
      if (ws.readyState === 1) {
        ws.send(payload);
        ws.send(JSON.stringify({ type: 'done' }));
      }
    }
  }

  /**
   * Send an error update.
   */
  sendError(executionId, errorMessage) {
    const subscribers = this.subscriptions.get(executionId);
    if (!subscribers) return;

    const payload = JSON.stringify({
      type: 'error',
      error: errorMessage,
    });

    for (const ws of subscribers) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }
}

function unsubscribe(wsManagerInst, ws, execId) {
  const set = wsManagerInst.subscriptions.get(execId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) wsManagerInst.subscriptions.delete(execId);
  }

  const clientSubs = wsManagerInst.clientSubscriptions.get(ws);
  if (clientSubs) {
    clientSubs.delete(execId);
  }
}

function sendExistingLogs(ws, execId) {
  try {
    const db = getDb();
    const logs = db.prepare(
      'SELECT level, message, timestamp FROM execution_logs WHERE execution_id = ? ORDER BY id'
    ).all(execId);

    for (const log of logs) {
      ws.send(JSON.stringify({
        type: 'log',
        data: {
          level: log.level,
          message: log.message,
          timestamp: log.timestamp,
        },
      }));
    }
  } catch {
    // DB might not be ready — skip history
  }
}

// Singleton
const wsManager = new WebSocketManager();

/**
 * Log a message for a specific execution — writes to DB + pushes via WS.
 */
export function logExecution(db, wsManagerInstance, executionId, level, message) {
  db.prepare(
    'INSERT INTO execution_logs (execution_id, level, message) VALUES (?, ?, ?)'
  ).run(executionId, level, message);

  wsManagerInstance.sendLog(executionId, level, message);
}

export default wsManager;
