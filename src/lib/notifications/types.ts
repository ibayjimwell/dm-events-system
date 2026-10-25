/** Public event types; immutable snapshots are stored in the DB outbox. */
export type NotificationKind =
  | 'BOOKING_CREATED'
  | 'BOOKING_STATUS_CHANGED'
  | 'BOOKING_DETAILS_UPDATED'
  | 'CANCELLATION_REQUESTED'
  | 'COORDINATOR_MESSAGE';

export type NotificationPayload = {
  kind: NotificationKind;
  bookingId: string;
  reference: string;
  source: 'ONLINE' | 'WALK_IN';
  name: string;
  eventType: string;
  eventDate: string;
  status: string;
  note?: string;
};
