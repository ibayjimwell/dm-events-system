/** Checks a downloaded backup's format, table counts and integrity hash without a database connection. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unpackManualBackup } from '../src/lib/manualBackupFormat';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run backup:verify -- <path/to/DM-Events-Backup-*.json.gz>');
  const backup = unpackManualBackup(await readFile(resolve(file)));
  console.log(`VERIFIED ${file}`);
  console.log(`Created: ${backup.exportedAt} | Schema: ${backup.schema} | Tables: ${backup.tableCount} | Records: ${backup.rowCount}`);
  console.log(`SHA-256: ${backup.sha256}`);
  console.log('Verification checks file integrity, not whether all external files or managed Supabase schemas are backed up.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Verification failed.'); process.exitCode = 1; });
