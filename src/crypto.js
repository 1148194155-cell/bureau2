import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

function deriveKey() {
  const envKey = process.env.LC_MASTER_KEY;
  if (envKey) {
    return crypto.scryptSync(envKey, 'localcanvas-salt', KEY_LENGTH);
  }

  const keyfilePath = path.join(os.homedir(), '.localcanvas', '.masterkey');
  try {
    const savedKey = fs.readFileSync(keyfilePath, 'utf8').trim();
    if (savedKey.length >= 32) {
      return crypto.scryptSync(savedKey, 'localcanvas-salt', KEY_LENGTH);
    }
  } catch { /* keyfile not found */ }

  // 首次生成随机 master key 并持久化
  const newKey = crypto.randomBytes(32).toString('hex');
  fs.ensureDirSync(path.dirname(keyfilePath));
  // 注意: 0o600 权限仅在 POSIX 系统 (Linux/macOS) 上生效
  // Windows NTFS 不支持 UNIX 权限位，本地使用无影响
  // 如果部署到 Linux 服务器，该文件自动设置为仅当前用户可读写
  fs.writeFileSync(keyfilePath, newKey, { mode: 0o600 });
  return crypto.scryptSync(newKey, 'localcanvas-salt', KEY_LENGTH);
}

const ENCRYPTION_KEY = deriveKey();

export function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText) {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export default { encrypt, decrypt };
