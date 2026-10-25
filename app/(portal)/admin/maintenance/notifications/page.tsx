import { pagePermission } from '@/lib/access';
import NotificationsEditor from '@/components/admin/NotificationsEditor';
export default async function Page() {
  await pagePermission('settings.manage');
  return <NotificationsEditor />;
}
