import { pagePermission } from '@/lib/access';
import BookedEventExperience from '@/components/client/BookedEventExperience';

// Client booking detail is personalized and must never be rendered as a static page.
export const dynamic = 'force-dynamic';

export default async function ClientBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await pagePermission('bookings.view.own');
  return <BookedEventExperience id={id} />;
}
