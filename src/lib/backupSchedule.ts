/** Scheduled times use Asia/Manila (UTC+08:00, without daylight saving). */
export type BackupFrequency = 'OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Return the next day, Monday or first of the month, at 00:15 Philippine time. */
export function nextBackupRun(frequency: BackupFrequency, after = new Date()): Date | null {
  if (frequency === 'OFF') return null;
  const local = new Date(after.getTime() + MANILA_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  if (frequency === 'DAILY') {
    return new Date(Date.UTC(year, month, local.getUTCDate() + 1, 0, 15) - MANILA_OFFSET_MS);
  }
  if (frequency === 'MONTHLY') {
    return new Date(Date.UTC(year, month + 1, 1, 0, 15) - MANILA_OFFSET_MS);
  }
  const weekday = local.getUTCDay();
  const daysUntilMonday = ((8 - weekday) % 7) || 7;
  return new Date(Date.UTC(year, month, local.getUTCDate() + daysUntilMonday, 0, 15) - MANILA_OFFSET_MS);
}
