import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { HttpError } from '@/lib/http';

// Application-layer encryption: private Storage alone is not enough for account backups.
const PREFIX = Buffer.from('DME1');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function backupKey(): Buffer {
  const value = process.env.BACKUP_ENCRYPTION_KEY?.trim() || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new HttpError(503, 'BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new HttpError(503, 'Invalid BACKUP_ENCRYPTION_KEY. Generate a new 32-byte key.');
  }
  return key;
}

export function encryptBackup(archive: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', backupKey(), nonce);
  // Authenticate the header as well as the archive body.
  cipher.setAAD(PREFIX);
  const encrypted = Buffer.concat([cipher.update(archive), cipher.final()]);
  return Buffer.concat([PREFIX, nonce, cipher.getAuthTag(), encrypted]);
}

export function decryptBackup(encoded: Buffer): Buffer {
  if (encoded.length <= PREFIX.length + NONCE_BYTES + TAG_BYTES || !encoded.subarray(0, PREFIX.length).equals(PREFIX)) {
    throw new HttpError(422, 'Invalid encrypted backup format.');
  }
  const offset = PREFIX.length;
  const nonce = encoded.subarray(offset, offset + NONCE_BYTES);
  const tag = encoded.subarray(offset + NONCE_BYTES, offset + NONCE_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', backupKey(), nonce);
    decipher.setAAD(PREFIX);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encoded.subarray(offset + NONCE_BYTES + TAG_BYTES)), decipher.final()]);
  } catch {
    throw new HttpError(422, 'The backup cannot be decrypted. Check its integrity and BACKUP_ENCRYPTION_KEY.');
  }
}

export function isBackupEncryptionConfigured() {
  try { backupKey(); return true; } catch { return false; }
}
