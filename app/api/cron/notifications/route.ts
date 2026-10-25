import { timingSafeEqual } from 'node:crypto';
import { route, ok, HttpError } from '@/lib/http';
import { processNotifications } from '@/lib/notifications/worker';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only a configured secret may trigger this worker. Can be invoked from a scheduler via GET. */
export const GET = route(async (req) => {
  const expected = process.env.NOTIFICATIONS_CRON_SECRET;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || expected.length < 32) throw new HttpError(503, 'Notification scheduler is not configured.');
  const a = Buffer.from(expected), b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Unauthorized');
  const result = await processNotifications(10);
  return ok(result);
});
