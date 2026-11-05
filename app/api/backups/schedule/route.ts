import { z } from 'zod';
import { requirePermission } from '@/lib/access';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { setBackupSchedule } from '@/lib/backupManager';
import { backupStorageReady } from '@/lib/backupStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = route(async req => {
  const user = await requirePermission('backups.manage');
  const { frequency } = z.object({ frequency: z.enum(['OFF', 'DAILY', 'WEEKLY', 'MONTHLY']) }).strict().parse(await readJson(req));
  if (frequency !== 'OFF' && !backupStorageReady()) throw new HttpError(503, 'Backup storage must be configured before scheduling backups.');
  if (frequency !== 'OFF' && (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)) {
    throw new HttpError(503, 'Automatic backups are not configured on the server.');
  }
  const schedule = await setBackupSchedule(frequency, user.id);
  return ok({ schedule: { frequency: schedule.frequency, nextRunAt: schedule.nextRunAt } });
});
