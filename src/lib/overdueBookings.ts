import { and, asc, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { auditLogs, bookingHistory, bookings, bookingValueEvents, notificationOutbox } from '@/db/schema';
import { manilaToday } from '@/lib/bookingWindow';
import { valueMovement } from '@/lib/confirmedValue';
import { notificationRows } from '@/lib/notifications/enqueue';

export const AUTO_CANCEL_NOTE = 'Automatically cancelled: the event date passed without being marked Completed (Philippine time).';
const OVERDUE_STATUSES = ['TENTATIVE', 'HELD', 'CONFIRMED'] as const;
const BATCH_SIZE = 150;
const MAX_BATCHES = 12;

/**
 * Idempotent, atomic expiration of bookings with dates before today (Manila).
 * This is run from the EXISTING daily Vercel cron, independently of the
 * selected backup frequency or whether backup storage is configured.
 *
 * Every committed transition includes a history entry, audit log, financial
 * REVERSAL for confirmed commitments, and deduplicated email/SMS outbox rows.
 * The system is recorded as a NULL actor (migration 0014), not as a fictitious
 * staff user. Concurrent jobs use SKIP LOCKED to avoid double cancellation.
 * No Completed or already Cancelled booking is touched.
 */
export async function cancelOverdueBookings(now: Date = new Date()): Promise<{
  today: string;
  cancelled: number;
  confirmedReversed: number;
  batches: number;
  complete: boolean;
}> {
  const today = manilaToday(now);
  let cancelled = 0;
  let confirmedReversed = 0;
  let batches = 0;
  let complete = false;

  for (let iteration = 0; iteration < MAX_BATCHES; iteration++) {
    const current = await db.transaction(async tx => {
      const overdue = await tx.select().from(bookings)
        .where(and(lt(bookings.eventDate, today), inArray(bookings.status, [...OVERDUE_STATUSES])))
        .orderBy(asc(bookings.eventDate), asc(bookings.id))
        .limit(BATCH_SIZE)
        .for('update', { skipLocked: true });
      if (!overdue.length) return { total: 0, reversed: 0 };

      const timestamp = new Date();
      await tx.update(bookings).set({
        status: 'CANCELLED',
        confirmedAt: null,
        cancellationRequestedAt: null,
        // Keep an existing client's cancellation reason if one was supplied.
        cancellationReason: sql`coalesce(nullif(${bookings.cancellationReason}, ''), ${AUTO_CANCEL_NOTE})`,
        updatedAt: timestamp,
      }).where(inArray(bookings.id, overdue.map(booking => booking.id)));

      const entries = await tx.insert(bookingHistory).values(overdue.map(booking => ({
        bookingId: booking.id,
        actorId: null,
        fromStatus: booking.status,
        toStatus: 'CANCELLED' as const,
        note: AUTO_CANCEL_NOTE,
        createdAt: timestamp,
      }))).returning({ id: bookingHistory.id, bookingId: bookingHistory.bookingId });
      const historyByBooking = new Map(entries.map(entry => [entry.bookingId, entry.id]));

      const movements = overdue.flatMap(booking => {
        const movement = valueMovement(booking.status, booking.bookedValue, 'CANCELLED', booking.bookedValue);
        return movement ? [{
          bookingId: booking.id, actorId: null, ...movement, recordedAt: timestamp,
          note: 'Automatic reversal: event date passed without completion',
        }] : [];
      });
      if (movements.length) await tx.insert(bookingValueEvents).values(movements);
      await tx.insert(auditLogs).values(overdue.map(booking => ({
        actorId: null,
        action: 'BOOKING_AUTO_CANCELLED',
        targetType: 'booking',
        targetId: booking.id,
        details: { eventDate: booking.eventDate, beforeStatus: booking.status, afterStatus: 'CANCELLED', businessDate: today },
        createdAt: timestamp,
      })));

      const notifications = overdue.flatMap(booking => {
        const historyId = historyByBooking.get(booking.id);
        return historyId ? notificationRows(booking, 'BOOKING_STATUS_CHANGED', historyId, { status: 'CANCELLED' }) : [];
      });
      if (notifications.length) await tx.insert(notificationOutbox).values(notifications).onConflictDoNothing();
      return { total: overdue.length, reversed: movements.length };
    });

    if (current.total === 0) { complete = true; break; }
    batches++;
    cancelled += current.total;
    confirmedReversed += current.reversed;
    if (current.total < BATCH_SIZE) { complete = true; break; }
  }
  return { today, cancelled, confirmedReversed, batches, complete };
}
