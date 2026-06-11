import crypto from 'node:crypto';
import os from 'node:os';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

/**
 * Derive an encryption key from a static app secret.
 * In production, use a proper key management system.
 */
function deriveKey() {
  // Derive from machine-identity to avoid hardcoding
  const machineId = os.hostname() + os.userInfo().username;
  const salt = crypto.createHash('sha256').update(machineId).digest('hex').slice(0, 16);
  return crypto.scryptSync('local-canvas-secret-key', salt, KEY_LENGTH);
}

const ENCRYPTION_KEY = deriveKey();

/**
 * Encrypt a plaintext string.
 * Returns: hex-encoded { iv, encrypted, authTag } format: "iv:authTag:encrypted"
 */
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a previously encrypted string.
 * Input format: "iv:authTag:encrypted" (hex-encoded)
 */
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
