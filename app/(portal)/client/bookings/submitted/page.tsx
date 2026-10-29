import { pagePermission } from '@/lib/access';
import { redirect } from 'next/navigation';
import { actor } from '@/lib/auth';
import { readBooking } from '@/models/read';
import { BookingSuccessCard } from '@/components/ui/BookingFeedback';
import { bookingStyles as s } from '@/components/ui/BookingSurface';

export default async function Submitted({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await pagePermission('bookings.view.own');
  const user = await actor();
  if (!user) redirect('/login');
  const { id } = await searchParams;
  if (!id) redirect('/client/bookings');
  const booking = await readBooking(id, user);
  return <main className={s.page}><div className={`${s.shell} py-4 sm:py-9`}>
    <BookingSuccessCard reference={booking.reference} status={booking.status} title="Your event journey begins here" message="Your booking request has been submitted. Our team will review the date, package and event preferences, and keep you updated through your Client portal." viewHref={`/client/bookings/${booking.id}`} messageHref={`/client/messages?booking=${booking.id}`}/>
  </div></main>;
}
