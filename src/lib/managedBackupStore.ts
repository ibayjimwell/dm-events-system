import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from '@/lib/http';
import { createManualBackup } from '@/lib/manualBackup';
import { decryptBackup, encryptBackup, isBackupEncryptionConfigured } from '@/lib/managedBackupCrypto';
import { unpackManualBackup } from '@/lib/manualBackupFormat';
import { DEFAULT_BACKUP_SCHEDULE, isBackupFrequency, type BackupScheduleSettings, type BackupFrequency } from '@/lib/backupSchedule';

const BUCKET = 'dm-events-private-backups';
const SCHEDULE_OBJECT = 'config/backup-schedule.json';
const AUTOS_TO_RETAIN = 7;
const HISTORY_LIMIT = 100;
const PATH_PATTERN = /^(automatic|manual)\/[A-Za-z0-9][A-Za-z0-9._-]{1,180}\.json\.gz\.enc$/;

type Kind = 'automatic' | 'manual';
type Store = ReturnType<typeof createClient>;

export type ManagedBackupEntry = {
  path: string;
  filename: string;
  kind: Kind;
  createdAt: string;
  bytes: number;
};

export function managedBackupConfig() {
  const storage = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const encrypted = isBackupEncryptionConfigured();
  const missing = [
    ...(!process.env.DATABASE_URL ? ['DATABASE_URL'] : []),
    ...(!process.env.SUPABASE_URL ? ['SUPABASE_URL'] : []),
    ...(!process.env.SUPABASE_SERVICE_ROLE_KEY ? ['SUPABASE_SERVICE_ROLE_KEY'] : []),
    ...(!encrypted ? ['BACKUP_ENCRYPTION_KEY'] : []),
  ];
  return {
    missing,
    storage,
    encrypted,
    scheduled: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16),
    ready: missing.length === 0,
  };
}

function client(): Store {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, 'Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function logAndThrow(action: string, error: unknown): never {
  console.error(`[DM Events backup] ${action}`, error);
  throw new HttpError(503, `Backup storage ${action.toLowerCase()} failed. Review Vercel function logs and Supabase Storage settings.`);
}

async function ensurePrivateBucket(store: Store) {
  const { data, error } = await store.storage.getBucket(BUCKET);
  if (!error && data) {
    if (data.public) throw new HttpError(503, 'The backup bucket must be private. Change its visibility in Supabase Storage.');
    return;
  }
  if (error && String('statusCode' in error ? error.statusCode : '') !== '404') {
    logAndThrow('checking bucket', error);
  }
  // The server creates the private bucket on first backup. A concurrent request can also create it.
  const created = await store.storage.createBucket(BUCKET, { public: false });
  if (created.error) {
    const retry = await store.storage.getBucket(BUCKET);
    if (retry.error || !retry.data || retry.data.public) logAndThrow('bucket creation', created.error);
  }
}

function parseEntry(kind: Kind, value: {
  name: string; created_at?: string | null; metadata?: { size?: number | string } | null;
}): ManagedBackupEntry | null {
  const path = `${kind}/${value.name}`;
  if (!PATH_PATTERN.test(path)) return null;
  return {
    path,
    filename: value.name.replace(/\.enc$/, ''),
    kind,
    createdAt: value.created_at || '',
    bytes: Number(value.metadata?.size || 0),
  };
}

async function bucketExists(store: Store): Promise<boolean> {
  const { data, error } = await store.storage.getBucket(BUCKET);
  if (error) {
    const status = String('statusCode' in error ? error.statusCode : '');
    if (status === '404') return false;
    logAndThrow('connecting to bucket', error);
  }
  if (!data) return false;
  if (data.public) throw new HttpError(503, 'Backup bucket is public; make it private before continuing.');
  return true;
}

/** Preferences live in the same private Storage bucket, not Vercel's ephemeral filesystem.
 * A missing bucket/object means no preference was saved yet: default to Daily.
 */
export async function getStoredBackupSchedule(): Promise<BackupScheduleSettings> {
  const store = client();
  if (!(await bucketExists(store))) return { ...DEFAULT_BACKUP_SCHEDULE };
  const { data: files, error: listError } = await store.storage.from(BUCKET).list('config', { limit: 30 });
  if (listError) logAndThrow('reading schedule', listError);
  if (!(files || []).some(file => file.name === 'backup-schedule.json')) {
    return { ...DEFAULT_BACKUP_SCHEDULE };
  }
  const { data, error } = await store.storage.from(BUCKET).download(SCHEDULE_OBJECT);
  if (error || !data) logAndThrow('downloading schedule', error || new Error('Missing schedule data'));
  try {
    const json = JSON.parse(await data.text()) as Record<string, unknown>;
    if (!isBackupFrequency(json.frequency) ||
      (json.updatedAt !== null && (typeof json.updatedAt !== 'string' || !Number.isFinite(Date.parse(json.updatedAt))))) {
      throw new Error('Invalid schedule data');
    }
    return { frequency: json.frequency, updatedAt: json.updatedAt as string | null };
  } catch (cause) {
    console.error('[DM Events backup] Corrupt persisted backup schedule:', cause);
    throw new HttpError(503, 'Saved backup schedule is invalid. Check the private Storage configuration object.');
  }
}

export async function saveStoredBackupSchedule(frequency: BackupFrequency): Promise<BackupScheduleSettings> {
  if (!isBackupFrequency(frequency)) throw new HttpError(400, 'Choose Daily, Weekly, or Monthly.');
  const store = client();
  await ensurePrivateBucket(store);
  const next: BackupScheduleSettings = { frequency, updatedAt: new Date().toISOString() };
  const { error } = await store.storage.from(BUCKET).upload(
    SCHEDULE_OBJECT, Buffer.from(JSON.stringify(next), 'utf8'),
    { upsert: true, contentType: 'application/json', cacheControl: '0' },
  );
  if (error) logAndThrow('saving schedule', error);
  return next;
}

export async function listStoredBackups(): Promise<ManagedBackupEntry[]> {
  const store = client();
  if (!(await bucketExists(store))) return [];
  const records: ManagedBackupEntry[] = [];
  for (const kind of ['automatic', 'manual'] as const) {
    const { data, error } = await store.storage.from(BUCKET).list(kind, {
      limit: HISTORY_LIMIT, offset: 0, sortBy: { column: 'created_at', order: 'desc' },
    });
    if (error) logAndThrow('listing', error);
    for (const item of data || []) {
      const entry = parseEntry(kind, item);
      if (entry) records.push(entry);
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pathIsValid(path: string): boolean { return PATH_PATTERN.test(path); }
function validPath(path: string): string {
  if (!pathIsValid(path)) throw new HttpError(400, 'Invalid backup filename.');
  return path;
}

async function pruneAutomaticBackups(store: Store) {
  const { data, error } = await store.storage.from(BUCKET).list('automatic', {
    limit: 100, sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) {
    console.error('Automatic backup retention listing failed:', error);
    return;
  }
  const all = (data || []).filter(x => PATH_PATTERN.test(`automatic/${x.name}`));
  const expired = all.slice(AUTOS_TO_RETAIN).map(x => `automatic/${x.name}`);
  if (expired.length) {
    const removed = await store.storage.from(BUCKET).remove(expired);
    if (removed.error) console.error('Automatic backup retention deletion failed:', removed.error);
  }
}

/** A stored snapshot is created and verified before old automatic backups can be pruned. */
export async function createStoredBackup(kind: Kind): Promise<{ backup: ManagedBackupEntry; alreadyExisted: boolean }> {
  const store = client();
  await ensurePrivateBucket(store);
  const date = new Date().toISOString();
  const dateOnly = date.slice(0, 10);
  const name = kind === 'automatic'
    ? `DM-Events-Auto-${dateOnly}.json.gz.enc`
    : `DM-Events-Backup-${date.replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.json.gz.enc`;
  const path = `${kind}/${name}`;

  // The automatic path is deterministic: a retry cannot create another backup for the same UTC day.
  if (kind === 'automatic') {
    const existing = (await listStoredBackups()).find(entry => entry.path === path);
    if (existing) return { backup: existing, alreadyExisted: true };
  }

  const snapshot = await createManualBackup();
  // Do not upload a malformed snapshot, even if the gzip operation succeeds.
  unpackManualBackup(snapshot.archive);
  const encrypted = encryptBackup(snapshot.archive);
  const { error } = await store.storage.from(BUCKET).upload(path, encrypted, {
    upsert: false, contentType: 'application/octet-stream', cacheControl: '0',
  });
  if (error) {
    if (kind === 'automatic') {
      const existing = (await listStoredBackups()).find(entry => entry.path === path);
      if (existing) return { backup: existing, alreadyExisted: true };
    }
    logAndThrow('uploading', error);
  }
  if (kind === 'automatic') await pruneAutomaticBackups(store);
  return {
    backup: { path, kind, filename: name.replace(/\.enc$/, ''), createdAt: date, bytes: encrypted.length },
    alreadyExisted: false,
  };
}

export async function readStoredBackup(path: string) {
  const store = client();
  if (!(await bucketExists(store))) throw new HttpError(404, 'Backup bucket not found.');
  const { data, error } = await store.storage.from(BUCKET).download(validPath(path));
  if (error || !data) {
    console.error('Backup download failed:', error);
    throw new HttpError(404, 'Backup file not found in private storage.');
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  const archive = decryptBackup(bytes);
  const payload = unpackManualBackup(archive); // detects tampering before serving
  return { archive, payload, filename: path.split('/')[1].replace(/\.enc$/, '') };
}

export async function deleteStoredBackup(path: string) {
  const store = client();
  const valid = validPath(path);
  if (!(await bucketExists(store))) throw new HttpError(404, 'Backup bucket not found.');
  const { data, error } = await store.storage.from(BUCKET).remove([valid]);
  if (error) logAndThrow('deleting', error);
  if (!data?.length) throw new HttpError(404, 'Backup was not found.');
  return valid;
}
