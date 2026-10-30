import 'dotenv/config';
import { createBackup } from '../src/lib/backup';
import { db } from '../src/db';
import { systemSettings } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  // GitHub scheduled workflows respect the switch in System Settings.
  if (process.env.RUN_SCHEDULED_BACKUP === '1') {
    const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, 'main'));
    if (!settings?.backupsEnabled) {
      console.log('Automatic backup disabled in System Settings; nothing uploaded.');
      return;
    }
  }
  const requestedId = process.argv[2]?.trim() || undefined;
  const result = await createBackup(null, requestedId);
  console.log(`Encrypted R2 backup ${result.id}: ${result.status}, ${result.sizeBytes} bytes`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Backup failed'); process.exitCode = 1; });
