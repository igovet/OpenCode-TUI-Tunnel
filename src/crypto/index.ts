import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { join } from 'node:path';

import { getConfigDir } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKeyPath(): string {
  return join(getConfigDir(), '.encryption-key');
}

function generateKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

function loadOrCreateKey(): Buffer {
  const keyPath = getEncryptionKeyPath();
  const configDir = getConfigDir();

  // Ensure config directory exists
  mkdirSync(configDir, { recursive: true });

  if (existsSync(keyPath)) {
    const keyHex = readFileSync(keyPath, 'utf8').trim();
    const key = Buffer.from(keyHex, 'hex');
    if (key.length === KEY_LENGTH) {
      return key;
    }
    // Key file corrupted or invalid length, regenerate
  }

  // Generate and save new key
  const key = generateKey();
  writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  return key;
}

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (!cachedKey) {
    cachedKey = loadOrCreateKey();
  }
  return cachedKey;
}

/**
 * Encrypt a passphrase using AES-256-GCM.
 * Returns a base64-encoded string in the format: iv:authTag:encryptedData
 */
export function encryptPassphrase(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a passphrase that was encrypted with encryptPassphrase.
 * Returns the original plaintext string.
 */
export function decryptPassphrase(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted passphrase format');
  }

  const [ivBase64, authTagBase64, encryptedData] = parts;
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a passphrase value appears to be encrypted (has the expected format).
 * Returns false if it looks like plaintext.
 */
export function isPassphraseEncrypted(value: string | null): boolean {
  if (!value) {
    return false;
  }
  // Encrypted format: base64:base64:base64 (three parts separated by colons)
  // Plaintext passphrases are unlikely to have this exact format
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p));
}
