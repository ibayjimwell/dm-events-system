import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

/** Portable data snapshot of the PostgreSQL public schema. The SQL schema is restored with Drizzle migrations. */
export const MANUAL_BACKUP_FORMAT = 'dm-events-public-data-v1' as const;
export const MAX_UNCOMPRESSED_BACKUP_BYTES = 150 * 1024 * 1024;

export type BackupTable = {
  name: string;
  columns: string[];
  rows: string[];
};
export type BackupPayload = {
  format: typeof MANUAL_BACKUP_FORMAT;
  exportedAt: string;
  schema: 'public';
  tableCount: number;
  rowCount: number;
  tables: BackupTable[];
};
export type BackupArchive = BackupPayload & { sha256: string };

function checksum(value: BackupPayload): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function packManualBackup(payload: BackupPayload): Buffer {
  return gzipSync(Buffer.from(JSON.stringify({ ...payload, sha256: checksum(payload) }), 'utf8'), { level: 6 });
}

/** Verifies the envelope and row totals before anyone attempts a database restore. */
export function unpackManualBackup(archive: Buffer): BackupArchive {
  const plain = gunzipSync(archive, { maxOutputLength: MAX_UNCOMPRESSED_BACKUP_BYTES });
  const parsed: unknown = JSON.parse(plain.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid backup document.');
  const file = parsed as Record<string, unknown>;
  if (file.format !== MANUAL_BACKUP_FORMAT || file.schema !== 'public' || typeof file.exportedAt !== 'string'
    || !Array.isArray(file.tables) || typeof file.sha256 !== 'string') {
    throw new Error('Unsupported or incomplete DM Events backup file.');
  }
  if (file.tables.length > 300) throw new Error('Backup contains too many tables.');
  const names = new Set<string>();
  let rowCount = 0;
  for (const table of file.tables) {
    if (!table || typeof table !== 'object' || Array.isArray(table)) throw new Error('Malformed backup table.');
    const t = table as BackupTable;
    if (typeof t.name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name) || names.has(t.name)
      || !Array.isArray(t.columns) || !Array.isArray(t.rows)) throw new Error('Invalid backup table definition.');
    names.add(t.name);
    if (!t.columns.length || t.columns.length > 300 || new Set(t.columns).size !== t.columns.length
      || t.columns.some(col => typeof col !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col))) {
      throw new Error('Invalid backup column definition.');
    }
    if (t.rows.length > 100_000) throw new Error('Backup table exceeds supported size.');
    for (const row of t.rows) {
      if (typeof row !== 'string') throw new Error('Invalid backup row.');
      const obj: unknown = JSON.parse(row);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Invalid backup row object.');
      if (Object.keys(obj).some(col => !t.columns.includes(col))) throw new Error('Unexpected column in backup row.');
    }
    rowCount += t.rows.length;
  }
  if (file.tableCount !== file.tables.length || file.rowCount !== rowCount) throw new Error('Backup row counts do not match.');
  const { sha256, ...unsigned } = file;
  if (!/^[a-f0-9]{64}$/.test(file.sha256) || checksum(unsigned as unknown as BackupPayload) !== file.sha256) {
    throw new Error('Backup integrity check failed. The file may be corrupt or modified.');
  }
  return file as unknown as BackupArchive;
}
