import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { users, authTokens } from '@/db/schema';
import { checkAuthLimit } from '@/lib/auth';
import { sendMail } from '@/lib/mail';
import { sendAccountSms } from '@/lib/notifications/accountSms';
import { HttpError } from '@/lib/http';

export type OtpChannel = 'EMAIL' | 'PHONE';
const lifetimeMinutes = 10;
export function otpPurpose(channel: OtpChannel) { return channel === 'EMAIL' ? 'SIGNUP_EMAIL' : 'SIGNUP_PHONE'; }
export function otpHash(userId: string, channel: OtpChannel, code: string) {
  // Keyed hashing prevents offline enumeration of the 1,000,000 possible codes if the DB leaks.
  const secret = process.env.AUTH_OTP_PEPPER || process.env.PYTHON_MAIL_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, 'Verification service is not configured.');
  return createHmac('sha256', secret).update(`dm-events:signup:${userId}:${channel}:${code}`).digest('hex');
}
export function otpReady() {
  return !!(process.env.PYTHON_MAIL_URL && (process.env.PYTHON_MAIL_SECRET?.length ?? 0) >= 32 &&
    process.env.HTTPSMS_API_KEY && /^\+[1-9]\d{6,14}$/.test(process.env.HTTPSMS_FROM ?? ''));
}

/** One live code per user/channel. Never store or log the raw code. */
export async function sendSignupCode(user: { id: string; email: string; phone: string | null }, channel: OtpChannel) {
  const recipient = channel === 'EMAIL' ? user.email : user.phone;
  if (!recipient) throw new HttpError(400, 'Phone number missing');
  await checkAuthLimit(`otp-send:${user.id}:${channel}`, 5);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const tokenHash = otpHash(user.id, channel, code);
  const now = new Date();
  await db.update(authTokens).set({ usedAt: now }).where(and(
    eq(authTokens.userId, user.id), eq(authTokens.purpose, otpPurpose(channel)), isNull(authTokens.usedAt),
  ));
  const [entry] = await db.insert(authTokens).values({
    userId: user.id, purpose: otpPurpose(channel), tokenHash,
    expiresAt: new Date(now.getTime() + lifetimeMinutes * 60_000),
  }).returning({ id: authTokens.id });
  try {
    if (channel === 'EMAIL') {
      await sendMail(recipient, 'DM Events · Verify your email',
        `Your DM Events verification code is ${code}. It expires in ${lifetimeMinutes} minutes. Do not share this code.`);
    } else {
      await sendAccountSms(recipient, `DM Events: Your verification code is ${code}. Expires in ${lifetimeMinutes} min. Do not share.`, randomUUID());
    }
  } catch (error) {
    // Failed gateway means no valid undelivered code remains; user can resend.
    await db.delete(authTokens).where(eq(authTokens.id, entry.id));
    throw error;
  }
}

/** Consume proof and record verification in one database transaction. */
export async function verifySignupCode(email: string, channel: OtpChannel, code: string) {
  const [user] = await db.select({id:users.id,emailVerifiedAt:users.emailVerifiedAt,
    phoneVerifiedAt:users.phoneVerifiedAt,signupVerificationRequired:users.signupVerificationRequired})
    .from(users).where(eq(users.email,email)).limit(1);
  if (!user || !user.signupVerificationRequired) throw new HttpError(400, 'Invalid or expired verification code');
  await checkAuthLimit(`otp-check:${user.id}:${channel}`, 8);
  const result = await db.transaction(async tx => {
    const [token] = await tx.update(authTokens).set({usedAt:new Date()}).where(and(
      eq(authTokens.userId,user.id), eq(authTokens.purpose,otpPurpose(channel)),
      eq(authTokens.tokenHash,otpHash(user.id,channel,code)), isNull(authTokens.usedAt),gt(authTokens.expiresAt,new Date()),
    )).returning({id:authTokens.id});
    if (!token) throw new HttpError(400,'Invalid or expired verification code');
    const [verified] = await tx.update(users).set(channel === 'EMAIL'
      ? {emailVerifiedAt:new Date(),updatedAt:new Date()}
      : {phoneVerifiedAt:new Date(),updatedAt:new Date()})
      .where(eq(users.id,user.id)).returning({emailVerifiedAt:users.emailVerifiedAt,phoneVerifiedAt:users.phoneVerifiedAt});
    return {emailVerified:!!verified.emailVerifiedAt,phoneVerified:!!verified.phoneVerifiedAt,
      completed:!!verified.emailVerifiedAt && !!verified.phoneVerifiedAt};
  });
  return result;
}
