import { db } from '@/db';
import { bookings, bookingServiceFeedback } from '@/db/schema';
import { requirePermission } from '@/lib/access';
import { audit } from '@/lib/auth';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { serviceFeedbackInput } from '@/lib/serviceFeedback';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

type Context = { params: Promise<{ id: string }> };

/** Private: only the signed-in owner of a completed ONLINE booking can read/write. */
async function requireReviewOwner(id: string) {
  const user = await requirePermission('bookings.view.own');
  if (user.role !== 'CLIENT') throw new HttpError(403, 'Only clients can rate their bookings.');
  const [booking] = await db.select({ id: bookings.id, clientId: bookings.clientId, status: bookings.status, source: bookings.source })
    .from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!booking || booking.clientId !== user.id || booking.source !== 'ONLINE') {
    throw new HttpError(404, 'Booking not found.');
  }
  if (booking.status !== 'COMPLETED') throw new HttpError(409, 'Feedback is available only after DM Events marks the event Completed.');
  return user;
}

export const GET = route(async (_req, ctx: Context) => {
  const { id } = await ctx.params;
  await requireReviewOwner(id);
  const [review] = await db.select({rating:bookingServiceFeedback.rating,comment:bookingServiceFeedback.comment,
    publicConsentAt:bookingServiceFeedback.publicConsentAt,updatedAt:bookingServiceFeedback.updatedAt})
    .from(bookingServiceFeedback).where(eq(bookingServiceFeedback.bookingId,id)).limit(1);
  return ok({ feedback: review ? {rating:review.rating,comment:review.comment,publish:!!review.publicConsentAt,updatedAt:review.updatedAt} : null });
});

export const PUT = route(async (req, ctx: Context) => {
  const { id } = await ctx.params;
  const user = await requireReviewOwner(id);
  const data = serviceFeedbackInput.parse(await readJson(req));
  const now = new Date();
  await db.transaction(async (tx) => {
    // Prevent a simultaneous staff status change and feedback submission.
    const [booking] = await tx.select({ clientId:bookings.clientId,status:bookings.status,source:bookings.source })
      .from(bookings).where(eq(bookings.id,id)).for('update');
    if (!booking || booking.clientId !== user.id || booking.status !== 'COMPLETED' || booking.source !== 'ONLINE') {
      throw new HttpError(409, 'This booking is not eligible for feedback.');
    }
    await tx.insert(bookingServiceFeedback).values({
      bookingId:id,clientId:user.id,rating:data.rating,comment:data.comment,
      publicConsentAt:data.publish ? now : null,updatedAt:now,
    }).onConflictDoUpdate({ target: bookingServiceFeedback.bookingId, set: {
      clientId:user.id,rating:data.rating,comment:data.comment,publicConsentAt:data.publish ? now : null,updatedAt:now,
    }});
  });
  await audit(user.id,'SERVICE_FEEDBACK_SAVED','booking',id,{ rating:data.rating,public:data.publish });
  revalidatePath('/');
  return ok({ success:true, message: data.publish ? 'Your review has been saved and may now appear on our homepage.' : 'Your private feedback has been saved.' });
});
