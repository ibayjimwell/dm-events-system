import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { HttpError } from '@/lib/http';

export type ReservedStatus = 'HELD' | 'CONFIRMED';

/** YYYY-MM-DD in the event business's timezone, regardless of server timezone. */
export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Never let JS normalize an impossible date such as February 30. */
export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isISOMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export async function dateReservation(date: string): Promise<ReservedStatus | null> {
  const [reserved] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(and(
      eq(bookings.eventDate, date),
      inArray(bookings.status, ['HELD', 'CONFIRMED']),
    ))
    .limit(1);
  return (reserved?.status as ReservedStatus | undefined) ?? null;
}

/** Server-side defense for clients using outdated calendars or calling APIs directly. */
export async function requireAvailableBookingDate(date: string): Promise<void> {
  if (!isISODate(date) || date < manilaToday()) {
    throw new HttpError(400, 'Choose today or a future valid date.');
  }
  if (await dateReservation(date)) {
    throw new HttpError(409, 'This date is already Held or Confirmed for another event. Choose an available date.');
  }
}

/** Public-safe calendar response: only date and reservation status. */
export async function reservedDatesForMonth(month: string): Promise<Array<{ date: string; status: ReservedStatus }>> {
  if (!isISOMonth(month)) throw new HttpError(400, 'Valid month required (YYYY-MM).');
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  const occupied = await db
    .select({ date: bookings.eventDate, status: bookings.status })
    .from(bookings)
    .where(and(
      gte(bookings.eventDate, `${month}-01`),
      lt(bookings.eventDate, next),
      inArray(bookings.status, ['HELD', 'CONFIRMED']),
    ));
  // The migration enforces at most one reservation per date; if old conflicting
  // data still exists, prefer CONFIRMED and never expose booking/customer data.
  const byDate = new Map<string, ReservedStatus>();
  for (const entry of occupied) {
    const status = entry.status as ReservedStatus;
    if (status === 'CONFIRMED' || !byDate.has(entry.date)) byDate.set(entry.date, status);
  }
  return Array.from(byDate, ([date, status]) => ({ date, status }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
