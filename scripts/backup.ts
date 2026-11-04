/** Saves a no-subscription DM Events backup locally. Reads DATABASE_URL from .env.local or .env. */
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in .env.local or the environment.');
  const { createManualBackup } = await import('../src/lib/manualBackup');
  // A local machine has more headroom than a short-lived Vercel request.
  const result = await createManualBackup(100 * 1024 * 1024, 100_000, 500_000, 100 * 1024 * 1024);
  const directory = resolve(process.env.LOCAL_BACKUP_DIR || 'backups');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const output = join(directory, result.filename);
  await writeFile(output, result.archive, { flag: 'wx', mode: 0o600 });
  console.log(`Saved ${output}`);
  console.log(`Snapshot: ${result.summary.tables} public tables, ${result.summary.rows} records, ${result.summary.compressedBytes} compressed bytes.`);
  console.log('This is a DATA backup only. Keep Drizzle migrations and external images separately.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Backup failed.'); process.exitCode = 1; });
