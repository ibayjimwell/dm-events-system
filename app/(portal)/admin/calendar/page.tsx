import { pagePermission } from '@/lib/access';
import Calendar from '@/components/coordinator/Calendar';
export default async function Page() {
  await pagePermission('calendar.view');
  return <Calendar role="ADMIN" />;
}
