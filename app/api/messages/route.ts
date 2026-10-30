import { after } from 'next/server';
import { can } from "@/lib/access";
import { notificationOutbox, bookings } from "@/db/schema";
import { notificationRows } from "@/lib/notifications/enqueue";
import { tryImmediateDelivery } from "@/lib/notifications/worker";
import { route, ok, readJson, HttpError } from "@/lib/http";
import { requireActor, audit, checkAuthLimit } from "@/lib/auth";
import { db } from "@/db";
import { messages, messageReads, mediaAssets, messageTyping, users } from "@/db/schema";
import { eq, and, gt, ne } from "drizzle-orm";
import { readBooking, readConversation } from "@/models/read";
import { messageInput, messageReadInput } from "@/lib/validators";

export const GET = route(async (req) => {
  const u = await requireActor();
  if (!(await can(u, "messages.staff")) && !(await can(u, "messages.own")))
    throw new HttpError(403, "Messaging module not allowed");
  const id = new URL(req.url).searchParams.get("bookingId") || "";
  if (!id) throw new HttpError(400, "bookingId required");
  const data = await readConversation(id, u);
  const [reads, typing] = await Promise.all([
    db.select({ userId: messageReads.userId, role: users.role, lastReadAt: messageReads.lastReadAt })
      .from(messageReads)
      .innerJoin(users, eq(users.id, messageReads.userId))
      .where(eq(messageReads.bookingId, id)),
    db.select({ userId: messageTyping.userId, expiresAt: messageTyping.expiresAt })
      .from(messageTyping)
      .where(and(eq(messageTyping.bookingId, id), eq(messageTyping.isTyping, true), gt(messageTyping.expiresAt, new Date()), ne(messageTyping.userId, u.id))),
  ]);
  return ok({ messages: data, reads, typing, viewerId: u.id });
});

export const POST = route(async (req) => {
  const u = await requireActor();
  if (
    u.role === "ADMIN" ||
    (!(await can(u, "messages.staff")) && !(await can(u, "messages.own")))
  )
    throw new HttpError(403, "Sending messages not permitted");
  const v = messageInput.parse(await readJson(req));
  await readBooking(v.bookingId, u);
  if (v.assetId) {
    const [a] = await db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, v.assetId),
          eq(mediaAssets.uploadedBy, u.id),
          eq(mediaAssets.kind, "MESSAGE"),
        ),
      );
    if (!a || a.bookingId) throw new HttpError(400, "Attachment unavailable");
  }
  if (u.role === "COORDINATOR")
    await checkAuthLimit("coordinator-messages:" + u.id, 30);
  const [m] = await db.transaction(async (tx) => {
    const [newMessage] = await tx
      .insert(messages)
      .values({
        bookingId: v.bookingId,
        senderId: u.id,
        body: v.body,
        assetId: v.assetId || null,
      })
      .returning();
    if (v.assetId)
      await tx
        .update(mediaAssets)
        .set({ bookingId: v.bookingId })
        .where(eq(mediaAssets.id, v.assetId));
    // Only staff replies create client notifications, never a client's own message.
    if (u.role === "COORDINATOR") {
      const [b] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, v.bookingId));
      if (b?.clientId) {
        const notifications = notificationRows(
          b,
          "COORDINATOR_MESSAGE",
          newMessage.id,
        );
        if (notifications.length)
          await tx
            .insert(notificationOutbox)
            .values(notifications)
            .onConflictDoNothing();
      }
    }
    return [newMessage];
  });
  // The message is durable at this point. Do not make the chat wait for
  // audit I/O, SMTP, SMS, or a temporarily unavailable notification gateway.
  // Next.js `after` runs after the HTTP response; queued notifications remain
  // available to the existing cron worker if immediate delivery fails.
  after(async () => {
    try { await audit(u.id, "MESSAGE_SENT", "booking", v.bookingId); }
    catch (error) { console.error('Message audit failed', error); }
    if (u.role === "COORDINATOR") {
      try { await tryImmediateDelivery(v.bookingId); }
      catch (error) { console.error('Message notification delivery deferred', error); }
    }
  });
  return ok({ message: m }, 201);
});
export const PATCH = route(async (req) => {
  const u = await requireActor();
  if (!(await can(u, "messages.staff")) && !(await can(u, "messages.own")))
    throw new HttpError(403, "Messaging module not allowed");
  const { bookingId } = messageReadInput.parse(await readJson(req));
  await readBooking(bookingId, u);
  await db
    .insert(messageReads)
    .values({ bookingId, userId: u.id, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [messageReads.bookingId, messageReads.userId],
      set: { lastReadAt: new Date() },
    });
  return ok({ success: true });
});
