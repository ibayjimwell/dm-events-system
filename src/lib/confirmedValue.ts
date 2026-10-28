/** Confirmation values are commitments in PHP, NOT revenue or payments. */
export type ConfirmedValueEventType = 'CONFIRMATION' | 'ADJUSTMENT' | 'REVERSAL';
export function cents(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) throw new Error('Invalid booking value');
  return Math.round(amount * 100);
}
export function valueMovement(beforeStatus: string, beforeValue: number | string | null,
  afterStatus: string, afterValue: number | string | null) {
  const before = beforeStatus === 'CONFIRMED' ? cents(beforeValue) : 0;
  const after = afterStatus === 'CONFIRMED' ? cents(afterValue) : 0;
  const delta = after - before;
  if (!delta) return null;
  const eventType: ConfirmedValueEventType = before === 0 ? 'CONFIRMATION' : after === 0 ? 'REVERSAL' : 'ADJUSTMENT';
  return { eventType, amountDelta: (delta / 100).toFixed(2), valueAfter: (after / 100).toFixed(2) };
}
/** Reporting dates are based on the local date of the Philippines, not UTC. */
export function manilaMonth(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  return `${year}-${month}`;
}
