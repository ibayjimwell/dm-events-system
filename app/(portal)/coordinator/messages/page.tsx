import { can, pagePermission } from '@/lib/access';
import { Suspense } from 'react';
import MessagesPanel from '@/components/shared/MessagesPanel';

export default async function Page() {
  const user = await pagePermission('messages.staff');
  // Messaging access works independently of booking-management permissions.
  // Show the booking-detail link only when that route is actually accessible.
  const canOpenBooking = await can(user, 'bookings.review') && await can(user, 'bookings.view.all');
  return <Suspense><MessagesPanel role={user.role} canOpenBooking={canOpenBooking}/></Suspense>;
}
