import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { notificationOutbox, bookings } from '@/db/schema';
import { requirePermission } from '@/lib/access';
import { audit } from '@/lib/auth';
import { route, ok, readJson, HttpError } from '@/lib/http';

function mask(value: string) {
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${value.slice(0, 4)}***${value.slice(-3)}`;
}

export const GET = route(async () => {
  await requirePermission('settings.manage');
  const rows = await db.select({
    id: notificationOutbox.id, reference: bookings.reference, eventType: notificationOutbox.eventType,
    channel: notificationOutbox.channel, recipient: notificationOutbox.recipient,
    status: notificationOutbox.status, attempts: notificationOutbox.attempts,
    lastError: notificationOutbox.lastError, createdAt: notificationOutbox.createdAt,
    processedAt: notificationOutbox.processedAt, nextAttemptAt: notificationOutbox.nextAttemptAt,
  }).from(notificationOutbox).innerJoin(bookings, eq(bookings.id, notificationOutbox.bookingId))
    .orderBy(desc(notificationOutbox.createdAt)).limit(100);
  return ok({ notifications: rows.map(row => ({ ...row, recipient: mask(row.recipient) })) });
});

export const POST = route(async req => {
  const user = await requirePermission('settings.manage');
  const { id } = z.object({ id: z.string().uuid() }).parse(await readJson(req));
  const [record] = await db.update(notificationOutbox).set({
    status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null, updatedAt: new Date(),
  }).where(and(eq(notificationOutbox.id, id), inArray(notificationOutbox.status, ['FAILED', 'RETRY'])))
    .returning({ id: notificationOutbox.id });
  if (!record) throw new HttpError(409, 'Only failed or retrying notifications can be queued again.');
  await audit(user.id, 'NOTIFICATION_REQUEUED', 'notification', id);
  return ok({ success: true });
});
