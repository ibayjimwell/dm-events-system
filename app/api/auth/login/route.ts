import { route, ok, readJson, HttpError } from '@/lib/http';
import { db } from '@/db';
import { users } from '@/db/schema';
import { login } from '@/lib/validators';
import { eq } from 'drizzle-orm';
import { comparePassword, createSession, checkAuthLimit, clearAuthLimit, audit } from '@/lib/auth';

export const POST = route(async (req) => {
  const data = login.parse(await readJson(req));
  const rateLimitKey = `login:${data.email}`;
  await checkAuthLimit(rateLimitKey, 10);

  const [user] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (!user || !user.isActive || !await comparePassword(data.password, user.passwordHash)) {
    throw new HttpError(401, 'Invalid email or password');
  }

  // Correct credentials: a pending signup must complete both OTP channels
  // before any session is issued. A machine-readable error tells the form to
  // open verification automatically, without a public Verify Account link.
  if (user.role === 'CLIENT' && user.signupVerificationRequired &&
      (!user.emailVerifiedAt || !user.phoneVerifiedAt)) {
    await clearAuthLimit(rateLimitKey);
    return ok({
      error: 'Complete email and phone verification to activate your account.',
      code: 'ACCOUNT_VERIFICATION_REQUIRED',
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      phoneVerified: Boolean(user.phoneVerifiedAt),
    }, 403);
  }

  // Legacy email-link accounts remain on their original flow; do not
  // incorrectly send them to signup OTPs they never received.
  if (process.env.EMAIL_VERIFICATION_REQUIRED === 'true' && !user.emailVerifiedAt) {
    throw new HttpError(403, 'Email not verified. Follow the verification link sent to your email.');
  }

  await clearAuthLimit(rateLimitKey);
  await createSession(user.id, user.role);
  await audit(user.id, 'LOGIN', 'user', user.id);
  return ok({user:{id:user.id, fullName:user.fullName, email:user.email, role:user.role}});
});
