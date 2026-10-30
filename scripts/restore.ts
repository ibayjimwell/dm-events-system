import 'dotenv/config';
import { db } from '../src/db';
import { backupLogs, auditLogs } from '../src/db/schema';
import { decryptBackup } from '../src/lib/backup';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const id = process.argv[2];
  if (!id || process.argv[3] !== `RESTORE-${id}` || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('Usage: npm run restore -- <BACKUP_UUID> RESTORE-<BACKUP_UUID>');
  }
  if (process.env.ALLOW_DESTRUCTIVE_RESTORE !== 'YES') {
    throw new Error('Set ALLOW_DESTRUCTIVE_RESTORE=YES after approving the destination and recovery plan');
  }
  // Use RESTORE_STORAGE_KEY when the destination is an empty TEST database and has no backup_logs table.
  let storageKey = process.env.RESTORE_STORAGE_KEY;
  if (storageKey) {
    if (!storageKey.endsWith(`/${id}.dump.aes256gcm`)) throw new Error('RESTORE_STORAGE_KEY must correspond to the specified BACKUP_UUID');
  } else {
    const [row] = await db.select().from(backupLogs).where(eq(backupLogs.id, id));
    if (row?.status !== 'SUCCESS' || !row.storageKey) throw new Error('Backup log was not found; use RESTORE_STORAGE_KEY for an empty staging DB');
    storageKey = row.storageKey;
  }
  const connection = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connection) throw new Error('MIGRATION_DATABASE_URL must point to the approved isolated restore database');
  const target = new URL(connection);
  if (!['postgresql:', 'postgres:'].includes(target.protocol)) throw new Error('Invalid PostgreSQL restore URL');
  console.log(`Restoring encrypted backup ${id} into approved host ${target.hostname}, database ${target.pathname.slice(1)}.`);
  const archive = await decryptBackup(storageKey);
  if (archive.subarray(0, 5).toString() !== 'PGDMP') throw new Error('Backup is not a PostgreSQL custom-format archive');
  const dir = mkdtempSync(join(tmpdir(), 'dme-restore-'));
  try {
    const file = join(dir, 'database.dump');
    writeFileSync(file, archive, { mode: 0o600 });
    execFileSync(process.env.PG_RESTORE_BIN || 'pg_restore', [
      '--clean', '--if-exists', '--no-owner', '--no-privileges',
      '--host', target.hostname, '--port', target.port || '5432',
      '--username', decodeURIComponent(target.username),
      '--dbname', decodeURIComponent(target.pathname.slice(1)), file,
    ], { env: { ...process.env, PGPASSWORD: decodeURIComponent(target.password), PGSSLMODE: 'require' }, stdio: 'inherit', timeout: 15 * 60 * 1000 });
    await db.insert(auditLogs).values({ actorId: null, action: 'BACKUP_RESTORED_BY_CLI', targetType: 'backup', targetId: id, details: { approvedBy: process.env.RESTORE_APPROVED_BY || 'operator' } });
    console.log('Restore completed. Validate application data before opening the restored system.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Restore failed'); process.exitCode = 1; });
