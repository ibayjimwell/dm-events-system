import { requirePermission } from '@/lib/access';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { audit } from '@/lib/auth';
import { createStoredBackup, getStoredBackupSchedule, listStoredBackups, managedBackupConfig, saveStoredBackupSchedule } from '@/lib/managedBackupStore';
import { backupRunWindow, DEFAULT_BACKUP_SCHEDULE, isAutomaticBackupOverdue, isBackupFrequency } from '@/lib/backupSchedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Saved schedule and backup history; all endpoints require explicit backup management access. */
export const GET = route(async () => {
  await requirePermission('backups.manage');
  const config = managedBackupConfig();
  const [backups, schedule] = config.ready
    ? await Promise.all([listStoredBackups(), getStoredBackupSchedule()])
    : [[], DEFAULT_BACKUP_SCHEDULE] as const;
  const window = backupRunWindow(schedule.frequency);
  const latestAuto = backups.find(entry => entry.kind === 'automatic');
  const overdue = config.ready && config.scheduled && isAutomaticBackupOverdue(
    schedule.frequency, latestAuto?.createdAt ?? null, schedule.updatedAt,
  );
  return ok({
    mode: 'managed-backups-v1',
    implementation: 'supabase-private-storage-vercel-cron',
    ...config,
    schedule,
    nextRunAt: window.nextAt,
    automaticOverdue: overdue,
    scheduleDescription: 'Daily at about 2 AM PH; Weekly on Monday; Monthly on the 1st (Asia/Manila)',
    retention: 'Seven automatic snapshots; manual backups retained until deleted',
    historyLimitPerKind: 100,
    backups,
    includes: 'PostgreSQL public schema data (not DDL or external uploads)',
  });
});

/** Create an encrypted backup immediately; the configured automatic frequency is unchanged. */
export const POST = route(async () => {
  const user = await requirePermission('backups.manage');
  const result = await createStoredBackup('manual');
  try { await audit(user.id, 'DATABASE_BACKUP_CREATED', 'backup', result.backup.path, { source: 'manual' }); }
  catch (error) { console.error('Backup created, but audit logging failed:', error); }
  return ok({ backup: result.backup }, 201);
});

/** Change the automatic frequency from the UI without a code redeploy. */
export const PATCH = route(async (req) => {
  const user = await requirePermission('backups.manage');
  if (!managedBackupConfig().ready) throw new HttpError(503, 'Backup storage is not ready. Configure the missing server environment variables first.');
  const body: unknown = await readJson(req);
  if (!body || typeof body !== 'object' || !('frequency' in body) || !isBackupFrequency(body.frequency)) {
    throw new HttpError(400, 'Choose a backup frequency: daily, weekly, or monthly.');
  }
  const schedule = await saveStoredBackupSchedule(body.frequency);
  try { await audit(user.id, 'BACKUP_SCHEDULE_UPDATED', 'backup', schedule.frequency); }
  catch (error) { console.error('Schedule saved, but audit logging failed:', error); }
  return ok({ schedule, nextRunAt: backupRunWindow(schedule.frequency).nextAt });
});
