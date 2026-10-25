import { notificationOutbox } from '@/db/schema';
import type { NotificationKind, NotificationPayload } from './types';
import { toE164 } from './phone';

type BookingContact = {
  id: string;
  reference: string;
  source: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  eventType: string;
  eventDate: string;
  status: string;
};

/** Build deduplicated rows INSIDE the caller's existing booking transaction. */
export function notificationRows(
  booking: BookingContact,
  kind: NotificationKind,
  eventId: string,
  overrides: { status?: string; note?: string } = {},
): (typeof notificationOutbox.$inferInsert)[] {
  const payload: NotificationPayload = {
    kind,
    bookingId: booking.id,
    reference: booking.reference,
    source: booking.source === 'WALK_IN' ? 'WALK_IN' : 'ONLINE',
    name: booking.contactName,
    eventType: booking.eventType,
    eventDate: booking.eventDate,
    status: overrides.status ?? booking.status,
    // Notes are deliberately omitted from the SMS and email to avoid sensitive disclosures.
  };
  const result: (typeof notificationOutbox.$inferInsert)[] = [];
  const email = booking.contactEmail.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320) {
    result.push({
      bookingId: booking.id, eventKey: `${kind}:${eventId}:EMAIL`, eventType: kind,
      channel: 'EMAIL', recipient: email, payload,
    });
  }
  const phone = toE164(booking.contactPhone);
  if (phone) {
    result.push({
      bookingId: booking.id, eventKey: `${kind}:${eventId}:SMS`, eventType: kind,
      channel: 'SMS', recipient: phone, payload,
    });
  }
  return result;
}
