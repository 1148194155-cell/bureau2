/**
 * WebSocket Manager for execution logging and real-time updates.
 *
 * Features:
 * - Token-based authentication on connection
 * - Heartbeat/ping-pong to detect dead connections
 * - Subscription-based log streaming
 * - Step-mode message routing
 */
import { WebSocketServer } from 'ws';
import { getDb } from './db.js';
import { verifyToken, getAuthDisabled } from './middleware/auth.js';

const HEARTBEAT_INTERVAL = 30000; // 30s
const HEARTBEAT_TIMEOUT = 5000;   // wait 5s for pong before close

class WebSocketManager {
  constructor() {
    this.wss = null;
    /** Map<execution_id, Set<WebSocket>> */
    this.subscriptions = new Map();
    /** Map<WebSocket, { execIds: Set<string>, alive: boolean, userId: number }> */
    this.clientMeta = new Map();
    /** Callback for step-mode messages */
    this.onStepMessage = null;
    /** Heartbeat timer */
    this._heartbeatTimer = null;
  }

  /**
   * Initialize the WebSocket server on top of an HTTP server.
   */
  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      // Authenticate via token query parameter
      const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
      const token = urlParams.get('token');
      const authDisabled = getAuthDisabled();

      let userId = 1; // default dev user
      if (!authDisabled) {
        const user = token ? verifyToken(token) : null;
        if (!user) {
          ws.send(JSON.stringify({ type: 'error', error: 'Authentication required. Pass ?token=<your-token> in WebSocket URL.' }));
          ws.close(4001, 'Unauthorized');
          return;
        }
        userId = user.userId;
      }

      this.clientMeta.set(ws, { execIds: new Set(), alive: true, userId });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          // Handle pong
          if (msg.type === 'pong') {
            const meta = this.clientMeta.get(ws);
            if (meta) meta.alive = true;
            return;
          }

          if (msg.type === 'subscribe') {
            const execId = msg.execution_id;
            if (!execId) {
              ws.send(JSON.stringify({ type: 'error', error: 'Missing execution_id' }));
              return;
            }

            if (!this.subscriptions.has(execId)) {
              this.subscriptions.set(execId, new Set());
            }
            this.subscriptions.get(execId).add(ws);
            this.clientMeta.get(ws)?.execIds.add(execId);

            ws.send(JSON.stringify({ type: 'subscribed', execution_id: execId }));
            sendExistingLogs(ws, execId);
          }

          if (msg.type === 'unsubscribe') {
            unsubscribe(this, ws, msg.execution_id);
          }

          if (msg.type === 'step_continue' || msg.type === 'step_skip' || msg.type === 'step_stop') {
            const action = msg.type === 'step_continue' ? 'continue' : msg.type === 'step_skip' ? 'skip' : 'stop';
            if (this.onStepMessage) {
              this.onStepMessage(msg.execution_id, action);
            }
          }
        } catch {
          ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
        }
      });

      ws.on('close', () => {
        const meta = this.clientMeta.get(ws);
        if (meta) {
          for (const execId of meta.execIds) {
            const set = this.subscriptions.get(execId);
            if (set) { set.delete(ws); if (set.size === 0) this.subscriptions.delete(execId); }
          }
        }
        this.clientMeta.delete(ws);
      });

      ws.on('error', () => {});
    });

    // Start heartbeat
    this._heartbeatTimer = setInterval(() => this._heartbeat(), HEARTBEAT_INTERVAL);
    this._heartbeatTimer.unref();
  }

  /** Send ping to all clients, terminate dead connections */
  _heartbeat() {
    for (const [ws, meta] of this.clientMeta) {
      if (!meta.alive) {
        ws.terminate();
        this.clientMeta.delete(ws);
        for (const execId of meta.execIds) {
          const set = this.subscriptions.get(execId);
          if (set) { set.delete(ws); if (set.size === 0) this.subscriptions.delete(execId); }
        }
        continue;
      }
      meta.alive = false;
      if (ws.readyState === 1) {
        try { ws.ping(); } catch {}
      }
    }
  }

  /** Send log to all subscribers of an execution */
  sendLog(executionId, level, message) {
    const subscribers = this.subscriptions.get(executionId);
    if (!subscribers || subscribers.size === 0) return;
    const payload = JSON.stringify({ type: 'log', data: { level, message, timestamp: new Date().toISOString() } });
    for (const ws of subscribers) {
      if (ws.readyState === 1) { try { ws.send(payload); } catch { subscribers.delete(ws); } }
      else { subscribers.delete(ws); }
    }
  }

  sendComplete(executionId, result) {
    const subscribers = this.subscriptions.get(executionId);
    if (!subscribers) return;
    const payload = JSON.stringify({ type: 'complete', execution_id: executionId, result });
    for (const ws of subscribers) {
      if (ws.readyState === 1) { try { ws.send(payload); } catch { subscribers.delete(ws); } }
      else { subscribers.delete(ws); }
    }
    this.subscriptions.delete(executionId);
    for (const [ws, meta] of this.clientMeta) { meta.execIds.delete(executionId); }
  }

  sendError(executionId, errorMessage) {
    const subscribers = this.subscriptions.get(executionId);
    if (!subscribers) return;
    const payload = JSON.stringify({ type: 'error', error: errorMessage });
    for (const ws of subscribers) {
      if (ws.readyState === 1) { try { ws.send(payload); } catch { subscribers.delete(ws); } }
      else { subscribers.delete(ws); }
    }
    this.subscriptions.delete(executionId);
    for (const [ws, meta] of this.clientMeta) { meta.execIds.delete(executionId); }
  }
}

function unsubscribe(wsManagerInst, ws, execId) {
  const set = wsManagerInst.subscriptions.get(execId);
  if (set) { set.delete(ws); if (set.size === 0) wsManagerInst.subscriptions.delete(execId); }
  const meta = wsManagerInst.clientMeta.get(ws);
  if (meta) meta.execIds.delete(execId);
}

function sendExistingLogs(ws, execId) {
  try {
    const db = getDb();
    const logs = db.prepare('SELECT level, message, timestamp FROM execution_logs WHERE execution_id = ? ORDER BY id').all(execId);
    for (const log of logs) {
      ws.send(JSON.stringify({ type: 'log', data: { level: log.level, message: log.message, timestamp: log.timestamp } }));
    }
  } catch (err) {
    try {
      ws.send(JSON.stringify({ type: 'log', data: { level: 'warn', message: '历史日志暂时不可用，新日志会实时推送', timestamp: new Date().toISOString() } }));
    } catch {}
  }
}

const wsManager = new WebSocketManager();

export function logExecution(db, wsManagerInstance, executionId, level, message) {
  db.prepare('INSERT INTO execution_logs (execution_id, level, message) VALUES (?, ?, ?)').run(executionId, level, message);
  wsManagerInstance.sendLog(executionId, level, message);
}

export default wsManager;
