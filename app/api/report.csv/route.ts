import { requirePermission } from '@/lib/access';
import { route, HttpError } from '@/lib/http';
import { audit } from '@/lib/auth';
import { db } from '@/db';
import { bookings, bookingValueEvents } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { buildAnalyticsCsv } from '@/lib/analyticsCsv';

export const runtime = 'nodejs';
export const GET = route(async (req) => {
  const user = await requirePermission('analytics.export');
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || 'all';
  const movementType = url.searchParams.get('type') || 'ALL';
  if (month !== 'all' && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Invalid reporting month');
  if (!['ALL', 'CONFIRMATION', 'ADJUSTMENT', 'REVERSAL'].includes(movementType)) throw new HttpError(400, 'Invalid movement filter');

  const localMonth = sql<string>`to_char(${bookingValueEvents.recordedAt} AT TIME ZONE 'Asia/Manila', 'YYYY-MM')`;
  const [monthly, movements] = await Promise.all([
    db.select({
      month: localMonth,
      amount: sql<string>`coalesce(sum(${bookingValueEvents.amountDelta}), 0)::text`,
      gross: sql<string>`coalesce(sum(CASE WHEN ${bookingValueEvents.amountDelta} > 0 THEN ${bookingValueEvents.amountDelta} ELSE 0 END), 0)::text`,
      reductions: sql<string>`coalesce(sum(CASE WHEN ${bookingValueEvents.amountDelta} < 0 THEN -${bookingValueEvents.amountDelta} ELSE 0 END), 0)::text`,
      count: sql<number>`count(*) FILTER (WHERE ${bookingValueEvents.eventType} = 'CONFIRMATION')::int`,
    }).from(bookingValueEvents).groupBy(localMonth).orderBy(localMonth),
    db.select({
      reference: bookings.reference, eventType: bookings.eventType, eventDate: bookings.eventDate,
      recordedAt: bookingValueEvents.recordedAt, movementType: bookingValueEvents.eventType,
      delta: bookingValueEvents.amountDelta, after: bookingValueEvents.valueAfter, note: bookingValueEvents.note,
    }).from(bookingValueEvents).innerJoin(bookings, eq(bookings.id, bookingValueEvents.bookingId))
      .orderBy(desc(bookingValueEvents.recordedAt)),
  ]);
  const csv = buildAnalyticsCsv({ monthly, movements, month, movementType, exportedAt: new Date() });
  await audit(user.id, 'ANALYTICS_EXPORT', 'report', 'confirmed-value-analytics', { month, movementType });
  const filename = `dm-events-analytics-${month === 'all' ? 'all-periods' : month}-${movementType.toLowerCase()}.csv`;
  return new Response(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
});
