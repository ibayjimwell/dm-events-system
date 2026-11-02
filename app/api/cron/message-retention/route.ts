import { timingSafeEqual } from 'node:crypto';
import { route, ok, HttpError } from '@/lib/http';
import { purgeExpiredChats } from '@/lib/messages/purge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Call daily using GitHub Actions or your own trusted scheduler.
 * The secret is required. Never invoke unauthenticated retention jobs. */
export const GET = route(async req => {
  const configured = [process.env.MESSAGE_RETENTION_SECRET, process.env.CRON_SECRET]
    .filter((secret): secret is string => !!secret && secret.length >= 32);
  if (!configured.length) throw new HttpError(503, 'Retention scheduler secret not configured');
  const value = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const token = Buffer.from(value);
  if (!configured.some(secret => {
    const expected = Buffer.from(secret);
    return token.length === expected.length && timingSafeEqual(token, expected);
  })) throw new HttpError(401, 'Unauthorized');
  return ok(await purgeExpiredChats());
});
