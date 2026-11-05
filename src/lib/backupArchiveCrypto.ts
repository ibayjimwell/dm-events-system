import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { HttpError } from '@/lib/http';

const MAGIC = Buffer.from('DME2');

export type BackupArchiveKeyStatus = 'READY' | 'MISSING' | 'TRAILING_BACKSLASH' | 'INVALID';

/** A non-secret explanation of the active server-side key configuration. */
export function backupArchiveKeyStatus(): BackupArchiveKeyStatus {
  const value = process.env.BACKUP_ARCHIVE_KEY ?? '';
  if (!value) return 'MISSING';
  if (/^[0-9a-f]{64}$/i.test(value)) return 'READY';
  if (/^[0-9a-f]{64}\\$/i.test(value)) return 'TRAILING_BACKSLASH';
  return 'INVALID';
}

function key(): Buffer {
  const value = process.env.BACKUP_ARCHIVE_KEY ?? '';
  if (backupArchiveKeyStatus() !== 'READY') {
    throw new HttpError(503, 'Backup encryption is not configured. Contact your system administrator.');
  }
  return Buffer.from(value, 'hex');
}

/** AES-256-GCM: four-byte version header, 12-byte IV, 16-byte tag, ciphertext. */
export function encryptBackupArchive(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBackupArchive(encrypted: Buffer): Buffer {
  if (encrypted.length < 33 || !encrypted.subarray(0, 4).equals(MAGIC)) {
    throw new HttpError(422, 'Unsupported backup archive.');
  }
  const archiveKey = key();
  try {
    const decipher = createDecipheriv('aes-256-gcm', archiveKey, encrypted.subarray(4, 16));
    decipher.setAuthTag(encrypted.subarray(16, 32));
    return Buffer.concat([decipher.update(encrypted.subarray(32)), decipher.final()]);
  } catch {
    throw new HttpError(422, 'Backup verification failed. The file cannot be decrypted.');
  }
}

export function backupEncryptionReady(): boolean {
  return backupArchiveKeyStatus() === 'READY';
}
