import { route, ok, readJson, HttpError } from '@/lib/http';
import { db } from '@/db';
import { users } from '@/db/schema';
import { registration } from '@/lib/validators';
import { eq } from 'drizzle-orm';
import { hashPassword, checkAuthLimit } from '@/lib/auth';
import { otpReady, sendSignupCode } from '@/lib/accountOtp';

export const POST = route(async req => {
  const data = registration.parse(await readJson(req));
  await checkAuthLimit(`register:${data.email}`, 4);
  await checkAuthLimit(`register-phone:${data.phone}`, 3);
  if (!otpReady()) throw new HttpError(503,
    'Account creation requires working Python Mail and httpSMS configuration. Please contact DM Events.');
  const existing = await db.select({id: users.id}).from(users).where(eq(users.email, data.email)).limit(1);
  if (existing.length) throw new HttpError(409, 'Email already registered. Log in or finish verification.');
  const [user] = await db.insert(users).values({
    fullName: data.fullName, email: data.email, phone: data.phone, role: 'CLIENT',
    passwordHash: await hashPassword(data.password),
    emailVerifiedAt: null, phoneVerifiedAt: null, signupVerificationRequired: true,
  }).onConflictDoNothing().returning({id:users.id,email:users.email,phone:users.phone});
  if (!user) throw new HttpError(409, 'Email already registered. Log in or finish verification.');
  // A gateway may fail after the user is created. Keep their pending account and
  // report per-channel results; resend works without re-registering the account.
  const delivery = await Promise.allSettled([
    sendSignupCode(user,'EMAIL'), sendSignupCode(user,'PHONE'),
  ]);
  return ok({verificationRequired:true, email:data.email,
    sent: {email:delivery[0].status==='fulfilled',phone:delivery[1].status==='fulfilled'},
    message:'Enter both six-digit verification codes to activate your account.'},201);
});
