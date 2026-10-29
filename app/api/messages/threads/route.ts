import { requireActor } from '@/lib/auth';
import { can } from '@/lib/access';
import { route, ok, HttpError } from '@/lib/http';
import { readBookings } from '@/models/read';
import { db } from '@/db';
import { messages, messageReads } from '@/db/schema';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

/** Sidebar summaries are calculated server-side. No other client's messages are exposed. */
export const GET = route(async () => {
  const user = await requireActor();
  if (!(await can(user, 'messages.own')) && !(await can(user, 'messages.staff'))) {
    throw new HttpError(403, 'Messaging is not permitted');
  }
  const bookings = await readBookings(user);
  if (!bookings.length) return ok({ threads: [], viewerId: user.id });
  const ids = bookings.map(b => b.id);
  const [latest, unread] = await Promise.all([
    db.selectDistinctOn([messages.bookingId], {
      bookingId: messages.bookingId,
      body: messages.body,
      assetId: messages.assetId,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
    }).from(messages).where(inArray(messages.bookingId, ids))
      .orderBy(messages.bookingId, desc(messages.createdAt)),
    db.select({ bookingId: messages.bookingId, count: sql<number>`count(*)::int` })
      .from(messages)
      .leftJoin(messageReads, and(
        eq(messageReads.bookingId, messages.bookingId),
        eq(messageReads.userId, user.id),
      ))
      .where(and(
        inArray(messages.bookingId, ids),
        ne(messages.senderId, user.id),
        sql`${messages.createdAt} > coalesce(${messageReads.lastReadAt}, 'epoch'::timestamptz)`,
      ))
      .groupBy(messages.bookingId),
  ]);
  const recent = new Map(latest.map(m => [m.bookingId, m]));
  const counts = new Map(unread.map(r => [r.bookingId, r.count]));
  const threads = bookings.map(b => ({
    id: b.id,
    reference: b.reference,
    clientName: b.clientName,
    eventType: b.eventType,
    eventDate: b.eventDate,
    status: b.status,
    source: b.source,
    latest: recent.get(b.id) ? {
      body: recent.get(b.id)!.body,
      hasAttachment: !!recent.get(b.id)!.assetId,
      senderId: recent.get(b.id)!.senderId,
      createdAt: recent.get(b.id)!.createdAt,
    } : null,
    unread: counts.get(b.id) || 0,
  })).sort((a,b) => {
    const dateA = a.latest?.createdAt ? new Date(a.latest.createdAt).getTime() : 0;
    const dateB = b.latest?.createdAt ? new Date(b.latest.createdAt).getTime() : 0;
    return dateB - dateA || a.reference.localeCompare(b.reference);
  });
  return ok({ threads, viewerId: user.id });
});
