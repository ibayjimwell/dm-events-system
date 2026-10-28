import { requirePermission } from '@/lib/access';
import { route, ok } from '@/lib/http';
import { db } from '@/db';
import { bookingValueEvents, bookings } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

// The ledger records financial commitments, not payments or revenue.
// A later price change/cancellation affects its own reporting month.
const localMonth = sql<string>`to_char(${bookingValueEvents.recordedAt} AT TIME ZONE 'Asia/Manila', 'YYYY-MM')`;
export const GET = route(async () => {
  await requirePermission('analytics.view');
  const [monthly, details] = await Promise.all([
    db.select({
      month: localMonth,
      amount: sql<string>`coalesce(sum(${bookingValueEvents.amountDelta}), 0)::text`,
      gross: sql<string>`coalesce(sum(CASE WHEN ${bookingValueEvents.amountDelta} > 0 THEN ${bookingValueEvents.amountDelta} ELSE 0 END), 0)::text`,
      reductions: sql<string>`coalesce(sum(CASE WHEN ${bookingValueEvents.amountDelta} < 0 THEN -${bookingValueEvents.amountDelta} ELSE 0 END), 0)::text`,
      count: sql<number>`count(*) FILTER (WHERE ${bookingValueEvents.eventType} = 'CONFIRMATION')::int`,
    }).from(bookingValueEvents).groupBy(localMonth).orderBy(localMonth),
    db.select({
      id: bookingValueEvents.id, reference: bookings.reference, eventType: bookings.eventType,
      eventDate: bookings.eventDate, recordedAt: bookingValueEvents.recordedAt,
      movementType: bookingValueEvents.eventType, amountDelta: bookingValueEvents.amountDelta,
      valueAfter: bookingValueEvents.valueAfter, note: bookingValueEvents.note,
    }).from(bookingValueEvents).innerJoin(bookings, eq(bookings.id, bookingValueEvents.bookingId))
      .orderBy(desc(bookingValueEvents.recordedAt)),
  ]);
  return ok({ monthly, details, reportBasis: 'PHP confirmed-value movements by recording month (Asia/Manila). Includes later increases, reductions and reversals in their own month. Not money received or profit.' });
});
