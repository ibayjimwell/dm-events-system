import { route, ok, readJson } from '@/lib/http';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { checkAuthLimit } from '@/lib/auth';
import { sendSignupCode } from '@/lib/accountOtp';

const input = z.object({email:z.string().trim().toLowerCase().email(),channel:z.enum(['EMAIL','PHONE']).default('EMAIL')});
export const POST = route(async req => {
  const {email,channel} = input.parse(await readJson(req));
  await checkAuthLimit(`otp-resend:${email}:${channel}`, 5);
  const [user] = await db.select({id:users.id,email:users.email,phone:users.phone,
    signupVerificationRequired:users.signupVerificationRequired,isActive:users.isActive,
    emailVerifiedAt:users.emailVerifiedAt,phoneVerifiedAt:users.phoneVerifiedAt,
  }).from(users).where(eq(users.email,email)).limit(1);
  // No account enumeration. Resend only for pending modern signups.
  if (user?.isActive && user.signupVerificationRequired && !(channel==='EMAIL'?user.emailVerifiedAt:user.phoneVerifiedAt))
    await sendSignupCode(user,channel);
  return ok({message:'If this account still needs verification, a new code has been sent.'});
});
