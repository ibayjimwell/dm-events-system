import 'dotenv/config';
import { decryptBackup } from '../src/lib/backup';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const storageKey = process.env.BACKUP_STORAGE_KEY;
  if (!storageKey) throw new Error('Set BACKUP_STORAGE_KEY=dm-events/postgres/YYYY-MM-DD/<UUID>.dump.aes256gcm');
  const dump = await decryptBackup(storageKey);
  if (dump.subarray(0, 5).toString() !== 'PGDMP') throw new Error('Decrypted backup is not a PostgreSQL custom-format archive');
  const temp = mkdtempSync(join(tmpdir(), 'dme-verify-'));
  try {
    const file = join(temp, 'database.dump');
    writeFileSync(file, dump, { mode: 0o600 });
    const list = execFileSync(process.env.PG_RESTORE_BIN || 'pg_restore', ['--list', file], {
      maxBuffer: 8 * 1024 * 1024, timeout: 120_000,
    }).toString('utf8');
    if (!list.includes('TABLE') || !list.includes('bookings')) throw new Error('Backup archive has no expected public booking tables');
    console.log('Verified: AES-256-GCM authenticated decryption; PostgreSQL custom archive and bookings catalog detected.');
    console.log('This is an archive verification, NOT a full restore test.');
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; });
