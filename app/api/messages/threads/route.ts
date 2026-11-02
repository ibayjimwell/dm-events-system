import { requireActor } from '@/lib/auth';
import { can } from '@/lib/access';
import { route, ok, HttpError } from '@/lib/http';
import { readMessageBookings } from '@/models/messaging';
import { db } from '@/db';
import { messages, messageReads, messageThreadPreferences, messageThreadDeletions } from '@/db/schema';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

/** Sidebar summaries are calculated server-side. No other client's messages are exposed. */
export const GET = route(async (req) => {
  const view = new URL(req.url).searchParams.get('view') || 'inbox';
  if (!['inbox','archived','trash'].includes(view)) throw new HttpError(400, 'Invalid conversation view');
  const user = await requireActor();
  if (!(await can(user, 'messages.own')) && !(await can(user, 'messages.staff'))) {
    throw new HttpError(403, 'Messaging is not permitted');
  }
  if (view === 'trash' && user.role === 'CLIENT') throw new HttpError(403, 'Only staff can view deleted conversations');
  const bookings = await readMessageBookings(user);
  if (!bookings.length) return ok({ threads: [], viewerId: user.id });
  const ids = bookings.map(b => b.id);
  const [prefs, deletions] = await Promise.all([
    db.select({ bookingId: messageThreadPreferences.bookingId, archivedAt: messageThreadPreferences.archivedAt })
      .from(messageThreadPreferences)
      .where(and(eq(messageThreadPreferences.userId, user.id), inArray(messageThreadPreferences.bookingId, ids))),
    db.select({ bookingId: messageThreadDeletions.bookingId, deletedAt: messageThreadDeletions.deletedAt,
      purgeAfter: messageThreadDeletions.purgeAfter, purgedAt: messageThreadDeletions.purgedAt })
      .from(messageThreadDeletions).where(inArray(messageThreadDeletions.bookingId, ids)),
  ]);
  const archivedIds = new Set(prefs.filter(row => !!row.archivedAt).map(row => row.bookingId));
  const removed = new Map(deletions.map(row => [row.bookingId, row]));
  const visible = bookings.filter(b => {
    const deletion = removed.get(b.id);
    if (view === 'trash') return !!deletion && !deletion.purgedAt && deletion.purgeAfter.getTime() > Date.now();
    if (deletion) return false;
    return view === 'archived' ? archivedIds.has(b.id) : !archivedIds.has(b.id);
  });
  if (!visible.length) return ok({ threads: [], viewerId: user.id });
  const visibleIds = visible.map(b => b.id);
  const [latest, unread] = await Promise.all([
    db.selectDistinctOn([messages.bookingId], {
      bookingId: messages.bookingId,
      body: messages.body,
      assetId: messages.assetId,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
    }).from(messages).where(inArray(messages.bookingId, visibleIds))
      .orderBy(messages.bookingId, desc(messages.createdAt)),
    db.select({ bookingId: messages.bookingId, count: sql<number>`count(*)::int` })
      .from(messages)
      .leftJoin(messageReads, and(
        eq(messageReads.bookingId, messages.bookingId),
        eq(messageReads.userId, user.id),
      ))
      .where(and(
        inArray(messages.bookingId, visibleIds),
        ne(messages.senderId, user.id),
        sql`${messages.createdAt} > coalesce(${messageReads.lastReadAt}, 'epoch'::timestamptz)`,
      ))
      .groupBy(messages.bookingId),
  ]);
  const recent = new Map(latest.map(m => [m.bookingId, m]));
  const counts = new Map(unread.map(r => [r.bookingId, r.count]));
  const threads = visible.map(b => ({
    id: b.id,
    reference: b.reference,
    clientName: b.clientName,
    eventType: b.eventType,
    eventDate: b.eventDate,
    status: b.status,
    source: b.source,
    deletedAt: removed.get(b.id)?.deletedAt ?? null,
    purgeAfter: removed.get(b.id)?.purgeAfter ?? null,
    latest: view !== 'trash' && recent.get(b.id) ? {
      body: recent.get(b.id)!.body,
      hasAttachment: !!recent.get(b.id)!.assetId,
      senderId: recent.get(b.id)!.senderId,
      createdAt: recent.get(b.id)!.createdAt,
    } : null,
    unread: view === 'trash' ? 0 : counts.get(b.id) || 0,
  })).sort((a,b) => {
    const dateA = a.latest?.createdAt ? new Date(a.latest.createdAt).getTime() : 0;
    const dateB = b.latest?.createdAt ? new Date(b.latest.createdAt).getTime() : 0;
    return dateB - dateA || a.reference.localeCompare(b.reference);
  });
  return ok({ threads, viewerId: user.id });
});
