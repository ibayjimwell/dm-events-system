/**
 * New event requests can be scheduled from today through the same calendar day
 * three months later, inclusive. A missing day is clamped to the target month's
 * final day (e.g. November 30 -> February 28/29).
 *
 * Dates are interpreted in Asia/Manila, not in the user's or Vercel server's
 * local timezone. Pure helpers are shared by UI and server validators.
 */
export const BOOKING_WINDOW_MONTHS = 3;

const pad = (value: number): string => String(value).padStart(2, '0');
const utcISO = (date: Date): string => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** Date.now() is used when no clock is supplied; pass a clock for deterministic tests. */
export function bookingDateWindow(now: Date = new Date(Date.now())): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string): number => Number(parts.find(item => item.type === type)?.value);
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const start = `${year}-${pad(month)}-${pad(day)}`;

  // Date.UTC normalizes the month/year before we clamp the day, avoiding the
  // JS rollover bug with dates like January 31 + one calendar month.
  const targetIndex = month - 1 + BOOKING_WINDOW_MONTHS;
  const lastDay = new Date(Date.UTC(year, targetIndex + 1, 0)).getUTCDate();
  const end = utcISO(new Date(Date.UTC(year, targetIndex, Math.min(day, lastDay))));
  return { start, end };
}

export function isValidBookingISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The upper and lower limits are both bookable dates. */
export function isBookableDate(value: string, now: Date = new Date(Date.now())): boolean {
  if (!isValidBookingISODate(value)) return false;
  const { start, end } = bookingDateWindow(now);
  return value >= start && value <= end;
}
