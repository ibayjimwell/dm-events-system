/**
 * Date-only event reservations are interpreted in Asia/Manila, not in the
 * server's UTC timezone or the browser's local timezone. This module has no
 * database or Node dependencies so both API routes and calendars use it.
 */
export const BOOKING_WINDOW_MONTHS = 3;

/** Format a point in time as the YYYY-MM-DD calendar date in the Philippines. */
export function manilaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (name: string) => parts.find(part => part.type === name)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Reject impossible dates instead of silently normalizing (e.g. Feb 30). */
export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Add calendar months, clamping to the last day of a shorter target month. */
export function addCalendarMonths(date: string, months: number): string {
  if (!isISODate(date) || !Number.isInteger(months)) throw new Error('Invalid booking date or month offset');
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function bookingWindow(now: Date = new Date()): { minDate: string; maxDate: string } {
  const minDate = manilaToday(now);
  return { minDate, maxDate: addCalendarMonths(minDate, BOOKING_WINDOW_MONTHS) };
}

export type BookingWindowRejection = 'invalid' | 'past' | 'too_far' | null;
export function bookingWindowRejection(date: string, now: Date = new Date()): BookingWindowRejection {
  if (!isISODate(date)) return 'invalid';
  const { minDate, maxDate } = bookingWindow(now);
  if (date < minDate) return 'past';
  if (date > maxDate) return 'too_far';
  return null;
}

export function bookingWindowError(reason: Exclude<BookingWindowRejection, null>, now: Date = new Date()): string {
  const { minDate, maxDate } = bookingWindow(now);
  if (reason === 'invalid') return 'Choose a valid event date.';
  if (reason === 'past') return `Past dates cannot be booked. Choose a date from ${minDate} through ${maxDate} (Philippine time).`;
  return `Bookings are limited to three months ahead. Choose a date on or before ${maxDate} (Philippine time).`;
}
