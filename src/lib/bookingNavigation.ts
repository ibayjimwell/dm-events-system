/**
 * A tightly scoped post-auth destination for client package requests.
 * Do not accept an arbitrary `next` URL; this is deliberately NOT a general
 * redirect helper. The only permitted destination is the client booking form.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGIN = 'https://dm-events.invalid';

export function bookingDestination(packageId?: string | null): string {
  return packageId ? `/client/book?package=${encodeURIComponent(packageId)}` : '/client/book';
}

export function safeBookingDestination(input: string | null | undefined): string | null {
  if (!input || !input.startsWith('/') || input.startsWith('//') || input.includes('\\')) return null;
  try {
    const parsed = new URL(input, ORIGIN);
    if (parsed.origin !== ORIGIN || parsed.pathname !== '/client/book' || parsed.hash) return null;
    if (Array.from(parsed.searchParams.keys()).some(key => key !== 'package')) return null;
    const values = parsed.searchParams.getAll('package');
    if (values.length > 1 || (values.length === 1 && !UUID.test(values[0]))) return null;
    return bookingDestination(values[0] ?? null);
  } catch {
    return null;
  }
}

export function loginForBooking(packageId?: string | null): string {
  return `/login?next=${encodeURIComponent(bookingDestination(packageId))}`;
}
