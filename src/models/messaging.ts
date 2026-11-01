import { db } from '@/db';
import { bookings, users } from '@/db/schema';
import { can } from '@/lib/access';
import type { Actor } from '@/lib/auth';
import { HttpError } from '@/lib/http';
import { desc, eq, sql } from 'drizzle-orm';

/** Messaging access is independent of the Bookings module permission.
 * A coordinator with messages.staff can reply without bookings.view.all.
 * Clients can never read messages belonging to another client.
 */
export async function requireMessageBooking(bookingId: string, actor: Actor) {
  const [booking] = await db.select({ id: bookings.id, clientId: bookings.clientId })
    .from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) throw new HttpError(404, 'Conversation not found');
  if (actor.role === 'CLIENT') {
    if (!(await can(actor, 'messages.own')) || booking.clientId !== actor.id)
      throw new HttpError(404, 'Conversation not found');
  } else if (!(await can(actor, 'messages.staff'))) {
    throw new HttpError(403, 'Messaging module not allowed');
  }
  return booking;
}

/** Only the fields needed for the inbox; keeps client messages strictly scoped. */
export async function readMessageBookings(actor: Actor) {
  const query = db.select({
    id: bookings.id,
    reference: bookings.reference,
    clientName: sql<string>`coalesce(${users.fullName}, ${bookings.contactName})`,
    eventType: bookings.eventType,
    eventDate: bookings.eventDate,
    status: bookings.status,
    source: bookings.source,
  }).from(bookings).leftJoin(users, eq(users.id, bookings.clientId));
  if (actor.role === 'CLIENT') {
    if (!(await can(actor, 'messages.own'))) throw new HttpError(403, 'Messaging module not allowed');
    return query.where(eq(bookings.clientId, actor.id)).orderBy(desc(bookings.createdAt));
  }
  if (!(await can(actor, 'messages.staff'))) throw new HttpError(403, 'Messaging module not allowed');
  return query.orderBy(desc(bookings.createdAt));
}
