import { z } from 'zod';
import { db } from '@/db';
import { bookings, messageThreadPreferences, messageThreadDeletions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireActor, audit } from '@/lib/auth';
import { can } from '@/lib/access';
import { HttpError, ok, readJson, route } from '@/lib/http';

const actionInput = z.object({ action: z.enum(['ARCHIVE','UNARCHIVE','DELETE','RESTORE']) }).strict();
const bookingIdInput = z.string().uuid();
const RETENTION_DAYS = 30;

export const PATCH = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await ctx.params;
  const bookingId = bookingIdInput.parse(id);
  const { action } = actionInput.parse(await readJson(req));
  const staff = actor.role !== 'CLIENT' && await can(actor, 'messages.staff');
  const client = actor.role === 'CLIENT' && await can(actor, 'messages.own');
  if (!staff && !client) throw new HttpError(403, 'Messaging module not allowed');
  if ((action === 'DELETE' || action === 'RESTORE') && !staff) {
    throw new HttpError(403, 'Only administrators and coordinators can delete or restore chats');
  }
  const [booking] = await db.select({ id: bookings.id, clientId: bookings.clientId })
    .from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking || (client && booking.clientId !== actor.id)) throw new HttpError(404, 'Conversation not found');
  const now = new Date();
  await db.transaction(async tx => {
    // Serialize actions on a booking to prevent deleting/restoring the same chat simultaneously.
    await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, bookingId)).for('update');
    const [deleted] = await tx.select().from(messageThreadDeletions)
      .where(eq(messageThreadDeletions.bookingId, bookingId)).limit(1);
    if (action === 'ARCHIVE' || action === 'UNARCHIVE') {
      if (deleted) throw new HttpError(410, 'This conversation has been deleted');
      await tx.insert(messageThreadPreferences).values({ bookingId, userId: actor.id,
        archivedAt: action === 'ARCHIVE' ? now : null })
        .onConflictDoUpdate({ target: [messageThreadPreferences.bookingId, messageThreadPreferences.userId],
          set: { archivedAt: action === 'ARCHIVE' ? now : null } });
    } else if (action === 'DELETE') {
      if (deleted) throw new HttpError(409, 'This conversation is already deleted');
      await tx.insert(messageThreadDeletions).values({ bookingId, deletedBy: actor.id,
        deletedAt: now, purgeAfter: new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000) });
    } else {
      if (!deleted || deleted.purgedAt || deleted.purgeAfter.getTime() <= now.getTime()) {
        throw new HttpError(410, 'The restoration window has expired');
      }
      await tx.delete(messageThreadDeletions).where(eq(messageThreadDeletions.bookingId, bookingId));
    }
  });
  // Do not leak conversation content into audit metadata.
  try { await audit(actor.id, `MESSAGE_THREAD_${action}`, 'booking', bookingId); }
  catch (error) { console.error('Message thread audit failed', error); }
  return ok({ success: true, action });
});
