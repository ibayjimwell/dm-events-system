import { sql } from '@/db';
import { HttpError } from '@/lib/http';
import { MANUAL_BACKUP_FORMAT, packManualBackup, type BackupPayload, type BackupTable } from '@/lib/manualBackupFormat';

// Browser downloads are intentionally limited: this is intended for small projects, not a large-scale data warehouse.
const WEB_LIMIT_BYTES = 18 * 1024 * 1024;
const WEB_ARCHIVE_LIMIT_BYTES = 4 * 1024 * 1024; // Keep under common serverless response limits.
const MAX_TABLE_ROWS = 20_000;
const MAX_TOTAL_ROWS = 80_000;

/** All SQL identifiers below originate from the PostgreSQL catalog, never from a request parameter. */
function identifier(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Unexpected database identifier.');
  return `"${name.replaceAll('"', '""')}"`;
}

export type LocalBackupResult = {
  filename: string;
  archive: Buffer;
  summary: { tables: number; rows: number; compressedBytes: number };
};

/**
 * Creates a consistent, data-only snapshot of all regular public tables.
 * Requires only the project's existing DATABASE_URL. No S3, R2, GitHub token or pg_dump binary.
 * It does NOT include Cloudinary media files, Supabase Storage, managed auth, or schema DDL.
 */
export async function createManualBackup(
  maxBytes = WEB_LIMIT_BYTES, maxTableRows = MAX_TABLE_ROWS, maxTotalRows = MAX_TOTAL_ROWS,
  maxArchiveBytes = WEB_ARCHIVE_LIMIT_BYTES,
): Promise<LocalBackupResult> {
  const exportedAt = new Date().toISOString();
  let totalRows = 0;
  let totalBytes = 0;
  const tables = await sql.begin(async tx => {
    await tx.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const catalog = await tx.unsafe(`
      SELECT c.relname AS name
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition
      ORDER BY c.relname
    `) as unknown as { name: string }[];
    if (!catalog.length) throw new HttpError(503, 'The public database schema has no tables to back up.');
    if (catalog.length > 300) throw new HttpError(413, 'Too many database tables for the simple backup tool.');
    const snapshots: BackupTable[] = [];
    for (const table of catalog) {
      const name = identifier(table.name);
      const columns = await tx.unsafe(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table.name]) as unknown as { column_name: string }[];
      // Avoid materializing an unbounded number of rows in a serverless function.
      const rows = await tx.unsafe(
        `SELECT to_jsonb(t)::text AS payload FROM public.${name} AS t LIMIT $1`, [maxTableRows + 1],
      ) as unknown as { payload: string }[];
      if (rows.length > maxTableRows) throw new HttpError(413, `Table ${table.name} is too large for a web download. Use the local backup CLI.`);
      totalRows += rows.length;
      if (totalRows > maxTotalRows) throw new HttpError(413, 'Too many records for a web download. Use the local backup CLI.');
      const data: BackupTable = { name: table.name, columns: columns.map(col => col.column_name), rows: rows.map(row => row.payload) };
      totalBytes += Buffer.byteLength(JSON.stringify(data), 'utf8');
      if (totalBytes > maxBytes) throw new HttpError(413, 'Database backup exceeds the simple download limit. Run npm run backup on your trusted local machine.');
      snapshots.push(data);
    }
    return snapshots;
  });

  const payload: BackupPayload = {
    format: MANUAL_BACKUP_FORMAT, exportedAt, schema: 'public',
    tableCount: tables.length, rowCount: totalRows, tables,
  };
  const archive = packManualBackup(payload);
  if (archive.length > maxArchiveBytes) throw new HttpError(413, 'Backup download exceeds the serverless response size limit. Run npm run backup on your local computer.');
  const filename = `DM-Events-Backup-${exportedAt.replace(/[:.]/g, '-').replace('T', '_')}.json.gz`;
  return { filename, archive, summary: { tables: tables.length, rows: totalRows, compressedBytes: archive.length } };
}
