import { db } from '@/db';
import { bookingServiceFeedback, bookings } from '@/db/schema';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { PublicServiceReview } from '@/lib/serviceFeedback';

/** Only opt-in reviews for completed events. No client identity or contact fields. */
export async function publishedServiceFeedback(): Promise<{ reviews: PublicServiceReview[]; count: number; average: number }> {
  const where = and(isNotNull(bookingServiceFeedback.publicConsentAt),eq(bookings.status,'COMPLETED'),
    eq(bookings.clientId,bookingServiceFeedback.clientId),eq(bookings.source,'ONLINE'));
  const [reviews, totals] = await Promise.all([
    db.select({rating:bookingServiceFeedback.rating,comment:bookingServiceFeedback.comment,
      createdAt:bookingServiceFeedback.createdAt}).from(bookingServiceFeedback)
      .innerJoin(bookings,eq(bookings.id,bookingServiceFeedback.bookingId))
      .where(where).orderBy(desc(bookingServiceFeedback.updatedAt)).limit(6),
    db.select({count:sql<number>`count(*)::int`, average:sql<number>`coalesce(avg(${bookingServiceFeedback.rating}),0)::float`})
      .from(bookingServiceFeedback).innerJoin(bookings,eq(bookings.id,bookingServiceFeedback.bookingId))
      .where(where),
  ]);
  return { reviews: reviews.map(r=>({rating:r.rating,comment:r.comment,createdAt:r.createdAt.toISOString()})),
    count:totals[0]?.count ?? 0,average:totals[0]?.average ?? 0 };
}
