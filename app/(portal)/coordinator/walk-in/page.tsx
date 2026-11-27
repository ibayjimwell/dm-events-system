import WalkInBooking from '@/components/shared/WalkInBooking';
import { pagePermission } from '@/lib/access';
import { publishedRequestedPackageId } from '@/models/bookingPackageSelection';

export default async function Page({ searchParams }: { searchParams: Promise<{ package?: string | string[] }> }) {
  await pagePermission('bookings.create.walkin');
  const packageId = await publishedRequestedPackageId((await searchParams).package);
  return <WalkInBooking role="COORDINATOR" initialPackageId={packageId} />;
}
