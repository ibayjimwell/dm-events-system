import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { notificationOutbox } from '@/db/schema';
import { DeliveryError, sendHttpSms, sendPythonEmail } from './providers';

const MAX_ATTEMPTS = 6;
const RETRY_AFTER_MS = 2 * 60_000;

/**
 * Claim work atomically (row locks + SKIP LOCKED), then deliver outside the
 * transaction. Expired PROCESSING jobs may be reclaimed after a crash.
 *
 * A small parallel batch prevents a slow SMTP connection from blocking SMS
 * or making the booking API wait for both transports sequentially.
 */
export async function processNotifications(limit = 2, bookingId?: string) {
  const now = new Date();
  const count = Math.min(10, Math.max(1, Math.trunc(limit)));

  const jobs = await db.transaction(async (tx) => {
    const claimed = await tx
      .select()
      .from(notificationOutbox)
      .where(and(
        inArray(notificationOutbox.status, ['PENDING', 'RETRY', 'PROCESSING']),
        lte(notificationOutbox.nextAttemptAt, now),
        bookingId ? eq(notificationOutbox.bookingId, bookingId) : undefined,
      ))
      .orderBy(asc(notificationOutbox.createdAt))
      .limit(count)
      .for('update', { skipLocked: true });

    for (const job of claimed) {
      await tx.update(notificationOutbox).set({
        status: 'PROCESSING',
        attempts: job.attempts + 1,
        nextAttemptAt: new Date(now.getTime() + RETRY_AFTER_MS),
        updatedAt: now,
      }).where(eq(notificationOutbox.id, job.id));
    }

    return claimed;
  });

  const results = await Promise.all(jobs.map(async (job) => {
    try {
      const providerId = job.channel === 'EMAIL'
        ? await sendPythonEmail(job.recipient, job.payload)
        : await sendHttpSms(job.recipient, job.payload, job.id);

      await db.update(notificationOutbox).set({
        status: 'ACCEPTED',
        providerId,
        lastError: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(notificationOutbox.id, job.id),
        eq(notificationOutbox.status, 'PROCESSING'),
      ));

      return 'accepted' as const;
    } catch (error) {
      const retryable = !(error instanceof DeliveryError) || error.retryable;
      const attempts = job.attempts + 1;
      const retry = retryable && attempts < MAX_ATTEMPTS;
      const delayMs = Math.min(60, 2 ** attempts) * 60_000;
      // Only safe error messages are persisted: never SMTP credentials,
      // HMAC headers, message bodies, or full recipient addresses.
      const safeError = error instanceof DeliveryError
        ? error.message
        : 'Unexpected notification processing failure';

      console.error('[DM Events notifications] Delivery failed', {
        channel: job.channel,
        notificationId: job.id,
        reason: safeError.slice(0, 200),
      });

      await db.update(notificationOutbox).set({
        status: retry ? 'RETRY' : 'FAILED',
        nextAttemptAt: new Date(Date.now() + delayMs),
        lastError: safeError.slice(0, 300),
        updatedAt: new Date(),
      }).where(and(
        eq(notificationOutbox.id, job.id),
        eq(notificationOutbox.status, 'PROCESSING'),
      ));

      return retry ? 'retried' as const : 'failed' as const;
    }
  }));

  return {
    claimed: jobs.length,
    accepted: results.filter((status) => status === 'accepted').length,
    retried: results.filter((status) => status === 'retried').length,
    failed: results.filter((status) => status === 'failed').length,
  };
}

/** Never roll back a committed booking because notification delivery failed. */
export async function tryImmediateDelivery(bookingId: string) {
  try {
    return await processNotifications(2, bookingId);
  } catch (error) {
    console.error(
      '[DM Events notifications] Delivery deferred to outbox retry worker:',
      error instanceof Error ? error.message : 'Unexpected worker failure',
    );
    return { claimed: 0, accepted: 0, retried: 0, failed: 0 };
  }
}
