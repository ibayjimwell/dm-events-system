import { requirePermission } from '@/lib/access';
import { route } from '@/lib/http';
import { audit } from '@/lib/auth';
import { db } from '@/db';
import { bookings, bookingValueEvents } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

function csv(value: unknown) {
  let text = String(value ?? '');
  // Spreadsheet formula injection protection for user-entered data.
  if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export const GET = route(async () => {
  const user = await requirePermission('analytics.export');
  const movements = await db.select({
    reference: bookings.reference, eventType: bookings.eventType, eventDate: bookings.eventDate,
    recordedAt: bookingValueEvents.recordedAt, movementType: bookingValueEvents.eventType,
    delta: bookingValueEvents.amountDelta, after: bookingValueEvents.valueAfter,
  }).from(bookingValueEvents).innerJoin(bookings, eq(bookings.id, bookingValueEvents.bookingId))
    .orderBy(desc(bookingValueEvents.recordedAt));
  const columns = ['Booking reference', 'Event type', 'Event date', 'Recorded at UTC', 'Movement', 'Value change (PHP)', 'Confirmed value after (PHP)'];
  const rows = [columns.map(csv).join(','), ...movements.map(x => [
    x.reference, x.eventType, x.eventDate, x.recordedAt.toISOString(), x.movementType, Number(x.delta), Number(x.after),
  ].map(csv).join(','))];
  await audit(user.id, 'ANALYTICS_EXPORT', 'report', 'booking-value-events');
  return new Response('\uFEFF' + rows.join('\r\n'), { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="dm-events-confirmed-value-ledger.csv"',
    'Cache-Control': 'no-store',
  } });
});
