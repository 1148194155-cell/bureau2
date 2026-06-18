/**
 * Auth Service — 用户认证业务逻辑。
 * @since 2025-01 阶段2：从 auth route 提取，消除路由层中内联 DB 操作。
 */
import { getDb } from '../db.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../middleware/auth.js';
import { createLogger } from '../logger.js';

const log = createLogger('auth-service');

export class AuthService {
  login({ username, password }) {
    if (!username || !password) {
      return { error: 'username and password are required', status: 400 };
    }
    const db = getDb();
    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return { error: 'Invalid username or password', status: 401 };
    }
    const token = signToken(user.id, user.username);
    log.info({ userId: user.id }, 'User logged in');
    return { data: { token, user: { id: user.id, username: user.username } } };
  }

  register({ username, password }) {
    if (!username || !password) {
      return { error: 'username and password are required', status: 400 };
    }
    if (password.length < 6) {
      return { error: 'Password must be at least 6 characters', status: 400 };
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return { error: 'Username already exists', status: 409 };
    }
    const hash = hashPassword(password);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    const token = signToken(result.lastInsertRowid, username);
    log.info({ userId: result.lastInsertRowid }, 'User registered');
    return { data: { token, user: { id: result.lastInsertRowid, username } }, status: 201 };
  }

  me(token) {
    const user = verifyToken(token);
    if (!user) return { error: 'Invalid token', status: 401 };
    return { data: { id: user.userId, username: user.username } };
  }
}

export const authService = new AuthService();
