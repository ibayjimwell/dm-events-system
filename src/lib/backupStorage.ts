import { createClient } from '@supabase/supabase-js';
import { HttpError } from '@/lib/http';
import { backupEncryptionReady } from '@/lib/backupArchiveCrypto';

export const BACKUP_BUCKET = 'dm-events-database-backups';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type BackupSetupIssue = 'SUPABASE_URL' | 'SUPABASE_SERVER_KEY' | 'BACKUP_ARCHIVE_KEY';

/**
 * This module runs on the server only. Supabase's newer sb_secret_* API keys
 * and legacy service_role JWTs are both accepted. A public/anon key is never
 * sufficient to administer the private backup bucket.
 */
function projectUrl(): string {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

function serverKey(): string {
  return (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function validUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      Boolean(parsed.hostname) && !/^(your_|project\.|your-project\.)/i.test(parsed.hostname) &&
      !parsed.username && !parsed.password;
  } catch { return false; }
}

function validServerKey(value: string): boolean {
  if (value.startsWith('sb_secret_')) return value.length > 'sb_secret_'.length + 15;
  if (!value || value.startsWith('sb_publishable_')) return false;
  // The legacy service_role key is a JWT. Checking its declared role catches
  // an accidentally pasted public (anon) key before making privileged calls.
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: string };
    return claims.role === 'service_role';
  } catch { return false; }
}

export function backupStorageSetup(): { configured: boolean; issues: BackupSetupIssue[] } {
  const issues: BackupSetupIssue[] = [];
  if (!validUrl(projectUrl())) issues.push('SUPABASE_URL');
  if (!validServerKey(serverKey())) issues.push('SUPABASE_SERVER_KEY');
  if (!backupEncryptionReady()) issues.push('BACKUP_ARCHIVE_KEY');
  return { configured: issues.length === 0, issues };
}

export function backupStorageReady(): boolean {
  return backupStorageSetup().configured;
}

function storageClient() {
  if (!backupStorageReady()) {
    throw new HttpError(503, 'Database backup configuration is incomplete. Check the Backup Center for details.');
  }
  return createClient(projectUrl(), serverKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage;
}

function isBucketNotFound(error: { status?: number; statusCode?: string | number; message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (Number(error.status ?? error.statusCode) === 404) return true;
  return error.code === 'NoSuchBucket' || /bucket not found|not found/i.test(error.message ?? '');
}

/** Creates the private bucket on first use; no manual Storage dashboard setup is necessary. */
export async function ensureBackupBucket(): Promise<void> {
  const storage = storageClient();
  const existing = await storage.getBucket(BACKUP_BUCKET);
  if (existing.data) {
    if (existing.data.public) throw new HttpError(503, 'The database backup bucket must be private. Change its access setting in Supabase Storage.');
    return;
  }
  if (!isBucketNotFound(existing.error)) {
    console.error('Backup storage bucket check failed:', existing.error);
    throw new HttpError(503, 'Cannot access Supabase Storage. Check the server access key, project URL and Storage permissions.');
  }
  const created = await storage.createBucket(BACKUP_BUCKET, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: ['application/octet-stream'],
  });
  if (created.error) {
    // Another request may have created it concurrently. Accept only a private bucket.
    const retry = await storage.getBucket(BACKUP_BUCKET);
    if (!retry.data || retry.data.public) {
      console.error('Backup storage bucket creation failed:', created.error);
      throw new HttpError(503, 'Could not initialize private backup storage. Check the Supabase project Storage settings.');
    }
  }
}

export async function uploadEncryptedArchive(storagePath: string, encrypted: Buffer): Promise<void> {
  if (encrypted.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'The backup exceeds the archive storage limit. Use the local backup command.');
  await ensureBackupBucket();
  const { error } = await storageClient().from(BACKUP_BUCKET).upload(
    storagePath, new Uint8Array(encrypted), { contentType: 'application/octet-stream', upsert: false },
  );
  if (error) {
    console.error('Backup archive upload failed:', error);
    throw new HttpError(503, 'Could not save the backup archive. Check Supabase Storage capacity and permissions.');
  }
}

export async function downloadEncryptedArchive(storagePath: string): Promise<Buffer> {
  const { data, error } = await storageClient().from(BACKUP_BUCKET).download(storagePath);
  if (error || !data) throw new HttpError(503, 'This backup file is not available in storage.');
  return Buffer.from(await data.arrayBuffer());
}

export async function removeEncryptedArchive(storagePath: string): Promise<void> {
  const { error } = await storageClient().from(BACKUP_BUCKET).remove([storagePath]);
  if (error) throw new HttpError(503, 'The backup could not be removed from storage.');
}
