/**
 * Structured logging module using pino.
 *
 * - JSON output to stdout for log collectors (Fluentd, Vector, etc.)
 * - Pretty-print in development via LC_PRETTY_LOG=1 or when TTY
 * - Log level via LC_LOG_LEVEL env (default: 'info')
 */
import pino from 'pino';
import { config } from './config.js';

const level = config.log.level;
const pretty = config.log.pretty || (process.stdout.isTTY && !config.log.jsonLog);

const logger = pino({
  level,
  ...(pretty ? {
    transport: {
      target: 'pino/file',
      options: { destination: 1 },
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
