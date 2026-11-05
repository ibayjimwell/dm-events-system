/**
 * Frequency selection for DM Events backups.
 * Vercel calls our single cron at 18:00 UTC each day (02:00 the next day in Manila).
 * The server reads a persisted preference before deciding whether to create a snapshot.
 */
export const BACKUP_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export type BackupScheduleSettings = {
  frequency: BackupFrequency;
  updatedAt: string | null;
};

export const DEFAULT_BACKUP_SCHEDULE: BackupScheduleSettings = {
  frequency: 'daily',
  updatedAt: null,
};

export function isBackupFrequency(value: unknown): value is BackupFrequency {
  return typeof value === 'string' && BACKUP_FREQUENCIES.includes(value as BackupFrequency);
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PH_OFFSET_MS = 8 * HOUR_MS;
const CRON_UTC_HOUR = 18;

/** Given a scheduled UTC cron invocation, check the date on the Manila calendar. */
export function shouldRunBackup(frequency: BackupFrequency, at: Date = new Date()): boolean {
  if (frequency === 'daily') return true;
  const ph = new Date(at.getTime() + PH_OFFSET_MS);
  if (frequency === 'weekly') return ph.getUTCDay() === 1; // Monday in Manila
  return ph.getUTCDate() === 1; // First day of month in Manila
}

/** The last and next 18:00 UTC cron slots for the selected schedule. */
export function backupRunWindow(frequency: BackupFrequency, now: Date = new Date()) {
  const todayAt18 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CRON_UTC_HOUR);
  let previous: Date | null = null;
  let next: Date | null = null;
  for (let dayOffset = -36; dayOffset <= 36; dayOffset++) {
    const at = new Date(todayAt18 + dayOffset * DAY_MS);
    if (!shouldRunBackup(frequency, at)) continue;
    if (at.getTime() <= now.getTime()) previous = at;
    if (at.getTime() > now.getTime() && !next) next = at;
  }
  if (!previous || !next) throw new Error('Could not determine the next backup window.');
  return { previousAt: previous.toISOString(), nextAt: next.toISOString() };
}

/** Warn only after a scheduled run was missed, allowing 6 hours for Vercel cron jitter and execution. */
export function isAutomaticBackupOverdue(
  frequency: BackupFrequency,
  latestAutomaticAt: string | null,
  scheduleUpdatedAt: string | null,
  now: Date = new Date(),
): boolean {
  const lastDue = Date.parse(backupRunWindow(frequency, now).previousAt);
  if (now.getTime() < lastDue + 6 * HOUR_MS) return false;
  const lastSuccess = latestAutomaticAt ? Date.parse(latestAutomaticAt) : NaN;
  if (Number.isFinite(lastSuccess) && lastSuccess >= lastDue) return false;
  // Changing the schedule creates a new monitoring baseline; do not warn about a past run.
  const lastChanged = scheduleUpdatedAt ? Date.parse(scheduleUpdatedAt) : NaN;
  if (Number.isFinite(lastChanged) && lastChanged >= lastDue) return false;
  return true;
}
