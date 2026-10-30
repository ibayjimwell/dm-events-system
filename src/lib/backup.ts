import { db } from '@/db';
import { backupLogs, systemSettings } from '@/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { HttpError } from '@/lib/http';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const prefix = 'dm-events/postgres/';

function configuration() {
  const secret = process.env.BACKUP_ENCRYPTION_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(secret)) throw new HttpError(503, 'BACKUP_ENCRYPTION_KEY must contain 64 hex characters');
  const bucket = process.env.BACKUP_S3_BUCKET;
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey || !/^https:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/i.test(endpoint)) {
    throw new HttpError(503, 'Cloudflare R2 backup environment variables are not configured');
  }
  return { encryptionKey: Buffer.from(secret, 'hex'), bucket, endpoint, accessKeyId, secretAccessKey };
}

function r2(config: ReturnType<typeof configuration>) {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 3,
  });
}

function dumpDatabase() {
  const connection = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connection) throw new HttpError(503, 'MIGRATION_DATABASE_URL is required for backup');
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password) {
    throw new HttpError(503, 'Invalid PostgreSQL backup connection string');
  }
  // Use argv instead of shell interpolation; never include a password in the command line.
  return execFileSync(process.env.PG_DUMP_BIN || 'pg_dump', [
    '--host', url.hostname, '--port', url.port || '5432',
    '--username', decodeURIComponent(url.username), '--dbname', decodeURIComponent(url.pathname.slice(1)),
    '--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--schema=drizzle',
  ], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'require' },
    timeout: 10 * 60 * 1000,
    maxBuffer: 150 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// DME1 | 12-byte IV | 16-byte GCM tag | ciphertext; backward compatible with existing restores.
function encryptDump(dump: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(dump), cipher.final()]);
  return Buffer.concat([Buffer.from('DME1'), iv, cipher.getAuthTag(), encrypted]);
}

function decryptDump(encrypted: Buffer, key: Buffer) {
  if (encrypted.length < 33 || encrypted.subarray(0, 4).toString() !== 'DME1') throw new Error('Unsupported backup file format');
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(4, 16));
  decipher.setAuthTag(encrypted.subarray(16, 32));
  return Buffer.concat([decipher.update(encrypted.subarray(32)), decipher.final()]);
}

function safeError(error: unknown) {
  // Do not store raw process stderr: connection URLs, passwords or hostnames might be included.
  if (error instanceof HttpError) return error.message;
  return 'PostgreSQL export, encryption, or Cloudflare R2 upload failed. Review the private backup runner logs.';
}

/** Must run on a host with pg_dump, e.g. GitHub Actions or an authorized local maintenance machine. */
export async function createBackup(performedBy: string | null = null, queuedLogId?: string) {
  let logId: string;
  if (queuedLogId) {
    if (!uuidPattern.test(queuedLogId)) throw new Error('Invalid queued backup ID');
    const [existing] = await db.update(backupLogs).set({ status: 'RUNNING' })
      .where(and(eq(backupLogs.id, queuedLogId), eq(backupLogs.status, 'QUEUED'))).returning({ id: backupLogs.id });
    if (!existing) throw new Error('Queued backup not found or already started');
    logId = existing.id;
  } else {
    const [created] = await db.insert(backupLogs).values({ performedBy, status: 'RUNNING' }).returning({ id: backupLogs.id });
    logId = created.id;
  }
  let client: S3Client | null = null;
  try {
    const config = configuration();
    client = r2(config);
    const key = `${prefix}${new Date().toISOString().slice(0, 10)}/${logId}.dump.aes256gcm`;
    const dump = dumpDatabase();
    if (!dump.length || dump.subarray(0, 5).toString() !== 'PGDMP') throw new Error('pg_dump did not return a valid custom-format archive');
    const encrypted = encryptDump(dump, config.encryptionKey);
    // Confirm encryption can be decoded before uploading; never save plaintext in object storage.
    if (!decryptDump(encrypted, config.encryptionKey).equals(dump)) throw new Error('Backup encryption verification failed');
    await client.send(new PutObjectCommand({
      Bucket: config.bucket, Key: key, Body: encrypted, ContentType: 'application/octet-stream',
      Metadata: { format: 'pg-custom-aes256gcm', origin: 'dm-events' },
    }));
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    if (Number(head.ContentLength) !== encrypted.length) throw new Error('Backup storage size verification failed');
    await db.update(backupLogs).set({ status: 'SUCCESS', storageKey: key, sizeBytes: encrypted.length, error: null })
      .where(eq(backupLogs.id, logId));
    // Cleanup is best effort and never changes the status of a successful upload.
    try {
      const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, 'main'));
      if (settings?.retentionDays) {
        const old = await db.select().from(backupLogs).where(and(
          eq(backupLogs.status, 'SUCCESS'), lt(backupLogs.createdAt, new Date(Date.now() - settings.retentionDays * 86400000)),
        ));
        for (const row of old) {
          if (!row.storageKey?.startsWith(prefix)) continue;
          await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: row.storageKey }));
          await db.update(backupLogs).set({ status: 'EXPIRED', storageKey: null }).where(eq(backupLogs.id, row.id));
        }
      }
    } catch { console.warn('Backup uploaded, but retention cleanup needs attention'); }
    return { id: logId, status: 'SUCCESS' as const, sizeBytes: encrypted.length };
  } catch (error) {
    await db.update(backupLogs).set({ status: 'FAILED', error: safeError(error) }).where(eq(backupLogs.id, logId));
    throw new Error(safeError(error));
  } finally {
    client?.destroy();
  }
}

export async function decryptBackup(storageKey: string) {
  if (!storageKey.startsWith(prefix) && !storageKey.startsWith('dm-events/')) throw new Error('Invalid backup storage key');
  const config = configuration();
  const client = r2(config);
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }));
    if (!result.Body) throw new Error('Cloudflare R2 returned an empty backup');
    return decryptDump(Buffer.from(await result.Body.transformToByteArray()), config.encryptionKey);
  } finally { client.destroy(); }
}
