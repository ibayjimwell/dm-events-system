import { timingSafeEqual } from 'node:crypto';
import { route, ok, HttpError } from '@/lib/http';
import { processNotifications } from '@/lib/notifications/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Invoke from Vercel Cron using CRON_SECRET, or from a trusted external
 * scheduler using NOTIFICATIONS_CRON_SECRET. Never make this route public.
 */
export const GET = route(async (req) => {
  const authorizedSecrets = [
    process.env.NOTIFICATIONS_CRON_SECRET,
    process.env.CRON_SECRET,
  ].filter((secret): secret is string => Boolean(secret && secret.length >= 32));

  if (!authorizedSecrets.length) {
    throw new HttpError(503, 'Notification scheduler is not configured.');
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const input = Buffer.from(provided);
  const authorized = authorizedSecrets.some((secret) => {
    const expected = Buffer.from(secret);
    return input.length === expected.length && timingSafeEqual(input, expected);
  });

  if (!authorized) throw new HttpError(401, 'Unauthorized');

  // Small concurrent batch to fit within a typical function invocation.
  return ok(await processNotifications(2));
});
