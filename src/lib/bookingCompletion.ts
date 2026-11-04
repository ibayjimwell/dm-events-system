/** Date-only bookings use the event's local calendar day in the Philippines. */
export function manilaDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function canMarkCompleted(status: string, eventDate: string, now: Date = new Date()): boolean {
  return status === 'CONFIRMED' && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    && eventDate <= manilaDate(now);
}
