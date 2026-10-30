import { route, ok, readJson } from '@/lib/http';
import { z } from 'zod';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { consumeAuthToken } from '@/lib/auth';
import { verifySignupCode } from '@/lib/accountOtp';

const request = z.union([
  z.object({email:z.string().trim().toLowerCase().email(), channel:z.enum(['EMAIL','PHONE']), code:z.string().regex(/^\d{6}$/)}),
  z.object({token:z.string().min(20)}),
]);
export const POST = route(async req => {
  const data = request.parse(await readJson(req));
  if ('token' in data) {
    // Older email-link verification remains compatible for legacy accounts.
    const id = await consumeAuthToken(data.token, 'VERIFY');
    await db.update(users).set({emailVerifiedAt:new Date()}).where(eq(users.id,id));
    return ok({success:true,completed:true});
  }
  return ok({success:true,...await verifySignupCode(data.email,data.channel,data.code)});
});
