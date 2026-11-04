import { and, desc, eq, lt, lte } from 'drizzle-orm';
import { db } from '@/db';
import { backupArchives, backupSchedules } from '@/db/schema';
import { HttpError } from '@/lib/http';
import { audit } from '@/lib/auth';
import { createManualBackup } from '@/lib/manualBackup';
import { unpackManualBackup } from '@/lib/manualBackupFormat';
import { encryptBackupArchive, decryptBackupArchive } from '@/lib/backupArchiveCrypto';
import { uploadEncryptedArchive, downloadEncryptedArchive, removeEncryptedArchive } from '@/lib/backupStorage';
import { nextBackupRun, type BackupFrequency } from '@/lib/backupSchedule';

export type BackupSource = 'MANUAL' | 'SCHEDULED';

async function reconcileInterruptedBackups() {
  // Serverless functions may be terminated during an export. Do not leave
  // an interrupted backup permanently blocking the unique running-job guard.
  await db.update(backupArchives).set({
    status: 'FAILED', completedAt: new Date(),
    error: 'The backup was interrupted. Create another backup to retry.',
  }).where(and(eq(backupArchives.status, 'RUNNING'), lt(backupArchives.createdAt, new Date(Date.now() - 15 * 60_000))));
}


/** Creates an encrypted stored snapshot and a persisted history entry. */
export async function saveBackup(source: BackupSource, createdBy: string | null = null) {
  await reconcileInterruptedBackups();
  let entry: typeof backupArchives.$inferSelect;
  try {
    [entry] = await db.insert(backupArchives).values({ source, status: 'RUNNING', createdBy }).returning();
  } catch (error) {
    if (error && typeof error === 'object' && ('code' in error) && error.code === '23505') {
      throw new HttpError(409, 'Another database backup is already in progress.');
    }
    throw error;
  }
  const path = `archives/${entry.id}.dmbackup`;
  let uploaded = false;
  try {
    const snapshot = await createManualBackup();
    const envelope = unpackManualBackup(snapshot.archive); // Validate before storing.
    const encrypted = encryptBackupArchive(snapshot.archive);
    await uploadEncryptedArchive(path, encrypted);
    uploaded = true;
    const [saved] = await db.update(backupArchives).set({
      status: 'SUCCESS', completedAt: new Date(), storagePath: path,
      filename: snapshot.filename, sizeBytes: encrypted.length,
      tableCount: snapshot.summary.tables, rowCount: snapshot.summary.rows,
      tableRows: envelope.tables.map(t => ({ name: t.name, rows: t.rows.length })),
    }).where(eq(backupArchives.id, entry.id)).returning();
    if (!saved) throw new Error('Backup history could not be updated.');
    try {
      await audit(createdBy, 'BACKUP_CREATED', 'backup', entry.id, { source, tables: snapshot.summary.tables, rows: snapshot.summary.rows });
    } catch (error) { console.warn('Backup audit event could not be saved:', error); }
    return saved;
  } catch (error) {
    if (uploaded) {
      try { await removeEncryptedArchive(path); } catch { /* Orphan can be removed during maintenance. */ }
    }
    const message = error instanceof HttpError ? error.message : 'The backup could not be completed. Try again or review server logs.';
    try { await db.update(backupArchives).set({ status: 'FAILED', completedAt: new Date(), error: message }).where(eq(backupArchives.id, entry.id)); }
    catch { console.error('Failed to record backup failure', entry.id); }
    throw error instanceof HttpError ? error : new HttpError(500, message);
  }
}

export async function getBackupHistory() {
  await reconcileInterruptedBackups();
  return db.select({
    id: backupArchives.id, source: backupArchives.source, status: backupArchives.status,
    createdAt: backupArchives.createdAt, completedAt: backupArchives.completedAt,
    filename: backupArchives.filename, sizeBytes: backupArchives.sizeBytes,
    tableCount: backupArchives.tableCount, rowCount: backupArchives.rowCount,
    tableRows: backupArchives.tableRows, error: backupArchives.error,
  }).from(backupArchives).orderBy(desc(backupArchives.createdAt)).limit(100);
}

export async function getStoredBackup(id: string): Promise<{ bytes: Buffer; filename: string }> {
  const [entry] = await db.select().from(backupArchives).where(eq(backupArchives.id, id)).limit(1);
  if (!entry || entry.status !== 'SUCCESS' || !entry.storagePath || !entry.filename) throw new HttpError(404, 'Backup not found.');
  const encrypted = await downloadEncryptedArchive(entry.storagePath);
  const bytes = decryptBackupArchive(encrypted);
  unpackManualBackup(bytes); // Verify SHA-256 and table counts before returning it.
  return { bytes, filename: entry.filename };
}

export async function deleteStoredBackup(id: string, performedBy: string) {
  const [entry] = await db.select().from(backupArchives).where(eq(backupArchives.id, id)).limit(1);
  if (!entry) throw new HttpError(404, 'Backup not found.');
  if (entry.status === 'RUNNING') throw new HttpError(409, 'A backup in progress cannot be deleted.');
  if (entry.storagePath) await removeEncryptedArchive(entry.storagePath);
  await db.delete(backupArchives).where(eq(backupArchives.id, id));
  try { await audit(performedBy, 'BACKUP_DELETED', 'backup', id, { source: entry.source }); }
  catch (error) { console.warn('Backup deletion audit could not be saved:', error); }
}

export async function readBackupSchedule() {
  let [schedule] = await db.select().from(backupSchedules).where(eq(backupSchedules.id, 'main'));
  if (!schedule) {
    [schedule] = await db.insert(backupSchedules).values({ id: 'main', frequency: 'OFF' })
      .onConflictDoNothing().returning();
    if (!schedule) [schedule] = await db.select().from(backupSchedules).where(eq(backupSchedules.id, 'main'));
  }
  return schedule;
}

export async function setBackupSchedule(frequency: BackupFrequency, actorId: string) {
  await db.insert(backupSchedules).values({ id: 'main', frequency: 'OFF' }).onConflictDoNothing();
  const [schedule] = await db.update(backupSchedules).set({
    frequency, nextRunAt: nextBackupRun(frequency), updatedAt: new Date(),
  }).where(eq(backupSchedules.id, 'main')).returning();
  await audit(actorId, 'BACKUP_SCHEDULE_UPDATED', 'backup_schedule', 'main', { frequency });
  return schedule;
}

/** Atomic claim: repeated cron invocations cannot create two backups for one due date. */
export async function runDueScheduledBackup(now = new Date()) {
  const settings = await readBackupSchedule();
  if (settings.frequency !== 'DAILY' && settings.frequency !== 'WEEKLY' && settings.frequency !== 'MONTHLY') return { skipped: true, reason: 'Schedule is off' };
  if (!settings.nextRunAt || settings.nextRunAt > now) return { skipped: true, reason: 'Not due yet' };
  const [claimed] = await db.update(backupSchedules).set({
    nextRunAt: nextBackupRun(settings.frequency, now), lastAttemptAt: now, updatedAt: now,
  }).where(and(eq(backupSchedules.id, 'main'), eq(backupSchedules.frequency, settings.frequency), lte(backupSchedules.nextRunAt, now)))
    .returning({ id: backupSchedules.id });
  if (!claimed) return { skipped: true, reason: 'Another worker already claimed this run' };
  const saved = await saveBackup('SCHEDULED');
  return { skipped: false, id: saved.id, status: saved.status };
}
