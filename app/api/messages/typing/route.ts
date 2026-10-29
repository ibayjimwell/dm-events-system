import { z } from 'zod';
import { db } from '@/db';
import { messageTyping } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireActor } from '@/lib/auth';
import { can } from '@/lib/access';
import { readBooking } from '@/models/read';
import { HttpError, ok, readJson, route } from '@/lib/http';

const input = z.object({ bookingId: z.string().uuid(), typing: z.boolean() }).strict();
const TTL_MS = 5500;

/** Rate-limited by a per-user DB timestamp to prevent a write per keystroke. */
export const POST = route(async req => {
  const user = await requireActor();
  if (user.role === 'ADMIN' || (!(await can(user, 'messages.staff')) && !(await can(user, 'messages.own')))) {
    throw new HttpError(403, 'Typing is not permitted');
  }
  const body = input.parse(await readJson(req));
  await readBooking(body.bookingId, user);
  const now = new Date();
  const [prior] = await db.select({ isTyping: messageTyping.isTyping, updatedAt: messageTyping.updatedAt })
    .from(messageTyping)
    .where(and(eq(messageTyping.bookingId, body.bookingId), eq(messageTyping.userId, user.id)))
    .limit(1);
  if (prior && prior.isTyping === body.typing && now.getTime() - prior.updatedAt.getTime() < 1200) {
    return ok({ success: true });
  }
  await db.insert(messageTyping).values({
    bookingId: body.bookingId,
    userId: user.id,
    isTyping: body.typing,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + (body.typing ? TTL_MS : 0)),
  }).onConflictDoUpdate({
    target: [messageTyping.bookingId, messageTyping.userId],
    set: { isTyping: body.typing, updatedAt: now, expiresAt: new Date(now.getTime() + (body.typing ? TTL_MS : 0)) },
  });
  return ok({ success: true });
});
