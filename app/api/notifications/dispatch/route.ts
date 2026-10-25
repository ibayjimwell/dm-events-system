import { route, ok } from '@/lib/http';
import { requirePermission } from '@/lib/access';
import { checkAuthLimit, audit } from '@/lib/auth';
import { processNotifications } from '@/lib/notifications/worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Staff with Settings permission may deliver existing queued jobs only. */
export const POST = route(async () => {
  const user = await requirePermission('settings.manage');
  await checkAuthLimit(`notification-dispatch:${user.id}`, 8);

  const result = await processNotifications(2);
  await audit(user.id, 'NOTIFICATION_DISPATCH', 'notification', user.id, result);
  return ok({ success: true, ...result });
});
