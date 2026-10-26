import { eq, inArray, and } from 'drizzle-orm';
import { route, ok, HttpError } from '@/lib/http';
import { db } from '@/db';
import { bookings } from '@/db/schema';

/** Public calendar availability; returns only the occupied/free boolean, not customer data. */
export const GET = route(async req => {
  const date=new URL(req.url).searchParams.get('date')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))
    throw new HttpError(400,'Valid date required (YYYY-MM-DD)');
  const [occupied]=await db.select({id:bookings.id}).from(bookings)
    .where(and(eq(bookings.eventDate,date),inArray(bookings.status,['HELD','CONFIRMED']))).limit(1);
  return ok({date,available:!occupied});
});
