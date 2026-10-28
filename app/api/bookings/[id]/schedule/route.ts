import { z } from 'zod';
import { db } from '@/db';
import { bookings, users, auditLogs } from '@/db/schema';
import { requirePermission } from '@/lib/access';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { and, eq } from 'drizzle-orm';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');
const scheduleInput = z.object({
  eventStartTime: time.nullable(), eventEndTime: time.nullable(),
  assignedCoordinatorId: z.string().uuid().nullable(),
  scheduleNotes: z.string().trim().max(3000),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).superRefine((v, ctx) => {
  if ((v.eventStartTime === null) !== (v.eventEndTime === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventEndTime'], message: 'Supply both start and end times, or leave both blank.' });
  } else if (v.eventStartTime && v.eventEndTime && v.eventStartTime >= v.eventEndTime) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventEndTime'], message: 'End time must be later than start time on the same day.' });
  }
});

/** Schedule updates are private staff actions; booking date and status are unchanged. */
export const PATCH = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requirePermission('bookings.status');
  const { id } = await ctx.params;
  const input = scheduleInput.parse(await readJson(req));
  const result = await db.transaction(async tx => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, id)).for('update');
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.status === 'CANCELLED') throw new HttpError(409, 'A cancelled booking cannot be scheduled.');
    if (booking.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new HttpError(409, 'This booking changed since it was loaded. Refresh and review the schedule before saving.');
    }
    if (input.assignedCoordinatorId && input.assignedCoordinatorId !== booking.assignedCoordinatorId) {
      const [coordinator] = await tx.select({ id: users.id }).from(users).where(and(
        eq(users.id, input.assignedCoordinatorId), eq(users.role, 'COORDINATOR'), eq(users.isActive, true),
      ));
      if (!coordinator) throw new HttpError(400, 'Select an active coordinator account.');
    }
    const changed = booking.eventStartTime !== input.eventStartTime ||
      booking.eventEndTime !== input.eventEndTime || booking.assignedCoordinatorId !== input.assignedCoordinatorId ||
      booking.scheduleNotes !== input.scheduleNotes;
    if (!changed) return { updated: false };
    const now = new Date();
    await tx.update(bookings).set({
      eventStartTime: input.eventStartTime, eventEndTime: input.eventEndTime,
      assignedCoordinatorId: input.assignedCoordinatorId, scheduleNotes: input.scheduleNotes,
      scheduleUpdatedAt: now, updatedAt: now,
    }).where(eq(bookings.id, id));
    // Internal schedule notes go in the staff-only audit log, not client-visible booking_history or notifications.
    await tx.insert(auditLogs).values({
      actorId: actor.id, action: 'BOOKING_SCHEDULE_UPDATED', targetType: 'booking', targetId: id,
      details: {
        eventDate: booking.eventDate,
        previous: { start: booking.eventStartTime, end: booking.eventEndTime, assigned: booking.assignedCoordinatorId },
        next: { start: input.eventStartTime, end: input.eventEndTime, assigned: input.assignedCoordinatorId },
        internalNotesChanged: booking.scheduleNotes !== input.scheduleNotes,
      },
    });
    return { updated: true };
  });
  return ok(result);
});
