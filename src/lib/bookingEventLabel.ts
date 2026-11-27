/**
 * Existing booking history, notifications and financial reports still use
 * bookings.event_type (varchar(120)). There is no longer a separate event-type
 * question: snapshot the published package's name at creation instead.
 *
 * An unselected package represents an event consultation, not an invented
 * wedding/birthday/etc. Never accept this value from an untrusted request.
 */
export const EVENT_CONSULTATION_LABEL = 'Event consultation';

export function bookingEventLabel(packageName?: string | null): string {
  const name = packageName?.trim();
  // PostgreSQL varchar length counts characters, not JavaScript UTF-16 units.
  return name ? Array.from(name).slice(0, 120).join('') : EVENT_CONSULTATION_LABEL;
}
