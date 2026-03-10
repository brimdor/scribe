import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { getConfig } from '../config/env.js';

const VERSION = 'v1';
const SALT = 'scribe-sqlite-at-rest';
const IV_BYTES = 12;
const KEY_BYTES = 32;

let keyCache = null;

function getEncryptionKey() {
  if (keyCache) {
    return keyCache;
  }

  const { encryptionKey } = getConfig();
  keyCache = scryptSync(encryptionKey, SALT, KEY_BYTES);
  return keyCache;
}

export function encryptJson(value) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    authTag.toString('base64'),
  ].join(':');
}

export function decryptJson(serialized) {
  if (!serialized || typeof serialized !== 'string') {
    return null;
  }

  const [version, ivB64, ciphertextB64, authTagB64] = serialized.split(':');
  if (version !== VERSION || !ivB64 || !ciphertextB64 || !authTagB64) {
    throw new Error('Encrypted payload format is invalid.');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(plaintext.toString('utf8'));
}
