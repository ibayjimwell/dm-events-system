import { requirePermission } from '@/lib/access';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { statusInput } from '@/lib/validators';
import { bookings, bookingHistory, auditLogs, bookingValueEvents, notificationOutbox } from '@/db/schema';
import { db } from '@/db';
import { and, eq, ne, inArray, sql } from 'drizzle-orm';
import { notificationRows } from '@/lib/notifications/enqueue';
import { tryImmediateDelivery } from '@/lib/notifications/worker';
import { valueMovement } from '@/lib/confirmedValue';

/** Atomic status, history, notification intent and confirmed-value accounting. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requirePermission('bookings.status');
  const { id } = await ctx.params;
  const input = statusInput.parse(await readJson(req));
  let changed = false;
  let output: { status: typeof input.status; changed: boolean; confirmedValueDelta: string | null };
  try {
    output = await db.transaction(async tx => {
      const [before] = await tx.select().from(bookings).where(eq(bookings.id, id)).for('update');
      if (!before) throw new HttpError(404, 'Booking not found');
      if (input.expectedUpdatedAt && before.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new HttpError(409, 'This booking was updated by another staff member. Refresh and review the latest values before saving.');
      }
      if (before.status === 'CANCELLED' && input.status !== 'CANCELLED') {
        throw new HttpError(409, 'Cancelled bookings cannot be reactivated. Create a new booking request.');
      }
      if (before.status === 'CONFIRMED' && !['CONFIRMED', 'CANCELLED'].includes(input.status)) {
        throw new HttpError(409, 'A confirmed event may be edited or cancelled, but cannot be silently moved back to inquiry/hold.');
      }
      const newValue = input.bookedValue === undefined ? before.bookedValue : input.bookedValue;
      if (input.status === 'CONFIRMED' && (newValue === null || Number(newValue) <= 0)) {
        throw new HttpError(400, 'Set a positive agreed booking value before confirming an event.');
      }
      const note = input.note === undefined ? before.reviewNote : input.note.trim();
      const valueChanged = input.bookedValue !== undefined &&
        ((newValue === null) !== (before.bookedValue === null) ||
          (newValue !== null && before.bookedValue !== null && Number(newValue) !== Number(before.bookedValue)));
      changed = before.status !== input.status || valueChanged || note !== before.reviewNote;
      if (!changed) return { status: before.status, changed: false, confirmedValueDelta: null };

      // Lock by event date as well as booking ID; the unique database constraint
      // is the final protection against simultaneous Held/Confirmed reservations.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${before.eventDate}))`);
      if (input.status === 'HELD' || input.status === 'CONFIRMED') {
        const conflicts = await tx.select({ reference: bookings.reference })
          .from(bookings).where(and(eq(bookings.eventDate, before.eventDate), ne(bookings.id, id),
            inArray(bookings.status, ['HELD', 'CONFIRMED'])));
        if (conflicts.length) throw new HttpError(409, `Date unavailable. Existing reservation: ${conflicts.map(x => x.reference).join(', ')}.`);
      }
      const movement = valueMovement(before.status, before.bookedValue, input.status, newValue);
      const now = new Date();
      await tx.update(bookings).set({
        status: input.status, bookedValue: newValue === null ? null : String(newValue),
        reviewNote: note, confirmedAt: input.status === 'CONFIRMED' ? before.confirmedAt ?? now : null,
        cancellationRequestedAt: input.status === 'CANCELLED' ? null : before.cancellationRequestedAt,
        updatedAt: now,
      }).where(eq(bookings.id, id));
      const [history] = await tx.insert(bookingHistory).values({
        bookingId: id, actorId: actor.id, fromStatus: before.status, toStatus: input.status,
        note: note || 'Booking reviewed', overrideConflict: false,
      }).returning({ id: bookingHistory.id });
      if (movement) {
        await tx.insert(bookingValueEvents).values({
          bookingId: id, actorId: actor.id, ...movement,
          recordedAt: now, note: `Booking status ${before.status} → ${input.status}`,
        });
      }
      await tx.insert(auditLogs).values({
        actorId: actor.id, action: 'BOOKING_STATUS_UPDATED', targetType: 'booking', targetId: id,
        details: { beforeStatus: before.status, afterStatus: input.status, valueDelta: movement?.amountDelta ?? null },
      });
      const kind = before.status !== input.status ? 'BOOKING_STATUS_CHANGED' : 'BOOKING_DETAILS_UPDATED';
      const notifications = notificationRows(before, kind, history.id, { status: input.status });
      if (notifications.length) await tx.insert(notificationOutbox).values(notifications).onConflictDoNothing();
      return { status: input.status, changed: true, confirmedValueDelta: movement?.amountDelta ?? null };
    });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === '23505' || e.cause?.code === '23505') {
      throw new HttpError(409, 'Another booking has reserved this date. Refresh the calendar before proceeding.');
    }
    throw error;
  }
  if (output.changed) {
    try { await tryImmediateDelivery(id); }
    catch (error) { console.error('Notification queued for later retry', id, error); }
  }
  return ok(output);
});
