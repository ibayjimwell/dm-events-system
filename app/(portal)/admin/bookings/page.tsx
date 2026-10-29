import { pagePermission, can } from '@/lib/access';
import RequestList from '@/components/coordinator/RequestList';

export default async function Page() {
  const user = await pagePermission('bookings.view.all');
  const canCreateWalkIn = await can(user, 'bookings.create.walkin');
  return <RequestList role="ADMIN" canCreateWalkIn={canCreateWalkIn} />;
}
