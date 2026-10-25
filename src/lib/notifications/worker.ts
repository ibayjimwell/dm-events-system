import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { notificationOutbox } from '@/db/schema';
import { DeliveryError, sendHttpSms, sendPythonEmail } from './providers';

const MAX_ATTEMPTS = 6;
/** Claims jobs atomically; SKIP LOCKED permits multiple cron workers safely. */
export async function processNotifications(limit = 10, bookingId?: string) {
  const now = new Date();
  const count = Math.min(20, Math.max(1, Math.trunc(limit)));
  const jobs = await db.transaction(async tx => {
    const claimed = await tx.select().from(notificationOutbox).where(and(
      inArray(notificationOutbox.status, ['PENDING', 'RETRY', 'PROCESSING']),
      lte(notificationOutbox.nextAttemptAt, now),
      bookingId ? eq(notificationOutbox.bookingId, bookingId) : undefined,
    )).orderBy(asc(notificationOutbox.createdAt)).limit(count).for('update', { skipLocked: true });
    for (const job of claimed) {
      await tx.update(notificationOutbox).set({
        status: 'PROCESSING', attempts: job.attempts + 1,
        nextAttemptAt: new Date(Date.now() + 2 * 60_000), updatedAt: now,
      }).where(eq(notificationOutbox.id, job.id));
    }
    return claimed;
  });

  const stats = { claimed: jobs.length, accepted: 0, retried: 0, failed: 0 };
  for (const job of jobs) {
    try {
      const providerId = job.channel === 'EMAIL'
        ? await sendPythonEmail(job.recipient, job.payload)
        : await sendHttpSms(job.recipient, job.payload, job.id);
      await db.update(notificationOutbox).set({
        status: 'ACCEPTED', providerId, lastError: null, processedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(notificationOutbox.id, job.id), eq(notificationOutbox.status, 'PROCESSING')));
      stats.accepted++;
    } catch (error) {
      const retryable = !(error instanceof DeliveryError) || error.retryable;
      const attempts = job.attempts + 1;
      const retry = retryable && attempts < MAX_ATTEMPTS;
      const delay = Math.min(60, 2 ** attempts) * 60_000;
      // Never save recipient phone/email or gateway credentials inside last_error.
      const safeError = error instanceof DeliveryError ? error.message : 'Unexpected gateway error';
      await db.update(notificationOutbox).set({
        status: retry ? 'RETRY' : 'FAILED',
        nextAttemptAt: new Date(Date.now() + delay),
        lastError: safeError.slice(0, 300), updatedAt: new Date(),
      }).where(and(eq(notificationOutbox.id, job.id), eq(notificationOutbox.status, 'PROCESSING')));
      if (retry) stats.retried++;
      else stats.failed++;
    }
  }
  return stats;
}

/** Delivery never reverses an already-committed booking transaction. */
export async function tryImmediateDelivery(bookingId: string) {
  try { await processNotifications(6, bookingId); }
  catch (error) { console.error('Notifications queued; worker delivery deferred:', error instanceof Error ? error.message : 'Unknown error'); }
}
