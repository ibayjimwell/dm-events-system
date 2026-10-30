// Optional externally-triggered scheduler. Never invokes pg_dump inside Vercel.
import { route, ok, HttpError } from '@/lib/http';
import { dispatchBackup } from '@/lib/backup-dispatch';
import { db } from '@/db';
import { systemSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const POST = route(async (req) => {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized');
  const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, 'main'));
  if (!settings?.backupsEnabled) return ok({ skipped: true, reason: 'Automatic backup policy disabled' });
  await dispatchBackup();
  return ok({ status: 'QUEUED', runner: 'GitHub Actions' }, 202);
});
