/**
 * Authentication middleware.
 *
 * Token-based auth with legacy X-User-Id fallback.
 * Default: authentication is ENABLED. Set LC_DISABLE_AUTH=1 for development only.
 *
 * Usage:
 *   import { authRequired } from './middleware/auth.js';
 *   router.use('/workflows', authRequired);
 *   // or per-route: router.get('/xxx', authRequired, handler);
 */
import crypto from 'node:crypto';
import { createLogger } from '../logger.js';
import { config } from '../config.js';

const log = createLogger('auth');

// ── Auth config ──

const AUTH_SECRET = config.auth.secret || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = config.auth.tokenTTL;
const AUTH_DISABLED = config.auth.disabled;

// ── Runtime auth override (toggleable from UI) ──

let _authOverride = null; // null = follow env, true = disabled, false = forced enabled

export function getAuthDisabled() {
  if (_authOverride !== null) return _authOverride;
  return AUTH_DISABLED;
}

export function setAuthDisabled(v) {
  _authOverride = !!v;
}

// ── Password helpers ──

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch { return false; }
}

// ── Token helpers ──

export function signToken(userId, username) {
  const payload = JSON.stringify({ uid: userId, uname: username, exp: Date.now() + TOKEN_TTL });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(b64).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return { userId: payload.uid, username: payload.uname };
  } catch { return null; }
}

// ── Extract user from request ──

export function extractUser(req) {
  // Token auth (preferred)
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '')
    || req.headers['x-auth-token']
    || req.query.token;
  if (token && token !== 'null' && token !== 'undefined') {
    const user = verifyToken(token);
    if (user) {
      req._authUser = user;
      return user;
    }
  }

  return null;
}

/**
 * Get effective user ID from request.
 * When auth is disabled (dev mode), returns user_id=1 as default.
 */
export function getUserId(req) {
  const user = extractUser(req);
  if (user) return user.userId;

  if (getAuthDisabled()) {
    const raw = req.headers['x-user-id'];
    return raw ? parseInt(raw, 10) || 1 : 1;
  }

  return null;
}

// ── Auth middleware ──

/**
 * Middleware: require valid authentication.
 * When auth is disabled (runtime or env), allows all requests as user_id=1.
 * Otherwise, requires a valid Bearer token or x-auth-token header.
 */
export function authRequired(req, res, next) {
  if (getAuthDisabled()) {
    req._authUser = { userId: 1, username: 'dev' };
    return next();
  }

  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide a valid Bearer token or log in at /api/auth/login.',
    });
  }

  req._authUser = user;
  next();
}

/**
 * Middleware: optional authentication. Sets req._authUser if token is valid,
 * but doesn't reject requests without a token.
 */
export function authOptional(req, res, next) {
  if (getAuthDisabled()) {
    req._authUser = { userId: 1, username: 'dev' };
    return next();
  }

  const user = extractUser(req);
  if (user) req._authUser = user;
  next();
}

export default {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  extractUser,
  getUserId,
  getAuthDisabled,
  setAuthDisabled,
  authRequired,
  authOptional,
};
