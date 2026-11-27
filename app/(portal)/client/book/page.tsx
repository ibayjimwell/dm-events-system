import { Suspense } from 'react';
import BookingWizard from '@/components/client/BookingWizard';
import { pagePermission } from '@/lib/access';
import { publishedRequestedPackageId } from '@/models/bookingPackageSelection';

export default async function Page({ searchParams }: { searchParams: Promise<{ package?: string | string[] }> }) {
  await pagePermission('bookings.create.own');
  const packageId = await publishedRequestedPackageId((await searchParams).package);
  return <Suspense><BookingWizard initialPackageId={packageId} /></Suspense>;
}
