import { timingSafeEqual } from 'node:crypto';
import { route, ok, HttpError } from '@/lib/http';
import { runDueScheduledBackup } from '@/lib/backupManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get('authorization') ?? '';
  if (!secret || secret.length < 32 || !bearer.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(bearer.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Invoked once daily by Vercel; frequency is chosen by an authorized administrator. */
export const GET = route(async req => {
  if (!authorized(req)) throw new HttpError(401, 'Unauthorized');
  const result = await runDueScheduledBackup();
  return ok(result);
});
