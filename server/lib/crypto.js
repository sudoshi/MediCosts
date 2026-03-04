/**
 * AES-256-GCM encryption for storing API keys in the database.
 * Key is derived from JWT_SECRET — no additional env var needed.
 */

import crypto from 'crypto';

let _key = null;

function getKey() {
  if (_key) return _key;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set — cannot encrypt');
  _key = crypto.scryptSync(secret, 'medicosts-ai', 32);
  return _key;
}

/**
 * Encrypt a plaintext string.
 * @returns {string} "<iv_hex>:<tag_hex>:<ciphertext_hex>"
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypt a string produced by encrypt().
 * @returns {string} plaintext
 */
export function decrypt(ciphertext) {
  const key = getKey();
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc, undefined, 'utf8') + decipher.final('utf8');
}
