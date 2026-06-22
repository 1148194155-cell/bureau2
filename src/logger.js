/**
 * Structured logging module using pino.
 *
 * - JSON output to stdout for log collectors (Fluentd, Vector, etc.)
 * - Pretty-print in development via LC_PRETTY_LOG=1 (requires pino-pretty installed)
 * - Log level via LC_LOG_LEVEL env (default: 'info')
 */
import pino from 'pino';
import { config } from './config.js';

const level = config.log.level;

// Only enable pretty-printing when LC_PRETTY_LOG=1 and pino-pretty is installed;
// avoids crashing when pino-pretty gets removed (e.g. by npm install).
let pretty = false;
if (process.env.LC_PRETTY_LOG === '1') {
  try {
    require.resolve('pino-pretty');
    pretty = true;
  } catch {
    console.warn('[logger] pino-pretty not installed, falling back to JSON output. Run: npm install pino-pretty');
  }
}

const logger = pino({
  level,
  ...(pretty ? {
    transport: {
      target: 'pino-pretty',
      options: { destination: 1, colorize: true, translateTime: 'HH:MM:ss' },
    },
  } : {}),
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  base: { pid: process.pid, service: 'local-canvas' },
});

// Re-export child logger factory for per-module namespaces
export function createLogger(name) {
  return logger.child({ module: name });
}

// Convenience HTTP logger
export function httpLogger(req, res, durationMs) {
  logger.info({
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    durationMs,
  }, `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
}

export default logger;
