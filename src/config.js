/**
 * Unified configuration module.
 *
 * Centralizes all process.env lookups so individual modules
 * import from a single source of truth instead of scattering
 * environment variable reads across the codebase.
 */
import path from 'node:path';
import os from 'node:os';

export const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3001,
    host: process.env.HOST || '0.0.0.0',
  },
  auth: {
    disabled: process.env.LC_DISABLE_AUTH === '1',
    secret: process.env.LC_AUTH_SECRET,
    tokenTTL: 7 * 24 * 3600 * 1000,
  },
  db: {
    dir: path.join(os.homedir(), '.localcanvas'),
    backupDir: path.join(os.homedir(), '.localcanvas', 'backups'),
    cleanup: { keepExecutions: 1000, keepLogs: 10000 },
  },
  log: {
    level: process.env.LC_LOG_LEVEL || 'info',
    pretty: process.env.LC_PRETTY_LOG === '1',
    jsonLog: process.env.LC_JSON_LOG,
  },
  sandbox: {
    image: 'localcanvas-sandbox',
    defaultTimeout: 30_000,
    defaultMemory: '256m',
    defaultCpu: '1.0',
  },
  execution: {
    defaultTimeout: 60_000,
    defaultRetryDelay: 1_000,
  },
  crypto: {
    masterKeyEnv: process.env.LC_MASTER_KEY,
  },
};

export default config;
