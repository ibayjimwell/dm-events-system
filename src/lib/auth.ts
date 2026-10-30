import { cache } from 'react';
import { db } from '@/db';
import { users, sessions, authTokens, authLimits } from '@/db/schema';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { HttpError } from './http';
export type Role='CLIENT'|'COORDINATOR'|'ADMIN';
export type Actor={id:string;email:string;fullName:string;phone:string|null;role:Role;isActive:boolean;emailVerifiedAt:Date|null;phoneVerifiedAt:Date|null;signupVerificationRequired:boolean};
const cookieName='dm_session';
export const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const randomToken=()=>randomBytes(32).toString('base64url');
export async function hashPassword(value:string){return bcrypt.hash(value,12);}
export async function comparePassword(plain:string,hash:string){return bcrypt.compare(plain,hash);}
export const actor = cache(async ():Promise<Actor|null> => {
 const token=(await cookies()).get(cookieName)?.value;
 if(!token)return null;
 const rows=await db.select({id:users.id,email:users.email,fullName:users.fullName,phone:users.phone,role:users.role,isActive:users.isActive,emailVerifiedAt:users.emailVerifiedAt,phoneVerifiedAt:users.phoneVerifiedAt,signupVerificationRequired:users.signupVerificationRequired}).from(sessions).innerJoin(users,eq(sessions.userId,users.id)).where(and(eq(sessions.tokenHash,digest(token)),gt(sessions.expiresAt,new Date()))).limit(1);
 if(!rows.length || !rows[0].isActive)return null;
 return rows[0];
});
export async function requireActor(...roles:Role[]):Promise<Actor> {
 const user=await actor();if(!user)throw new HttpError(401,'Please log in');
 if(roles.length && !roles.includes(user.role))throw new HttpError(403,'Not authorized for this action');
 if(user.role==='CLIENT'&&user.signupVerificationRequired&&(!user.emailVerifiedAt||!user.phoneVerifiedAt))throw new HttpError(403,'Verify both your email and phone to continue');
 if(process.env.EMAIL_VERIFICATION_REQUIRED==='true'&&!user.emailVerifiedAt)throw new HttpError(403,'Verify your email address to continue');
 return user;
}
export async function createSession(userId:string, role?:Role){
 const token=randomToken();const days=Number(process.env.SESSION_DAYS||'7');const expires=new Date(Date.now()+days*86400000);
 await db.insert(sessions).values({userId,tokenHash:digest(token),expiresAt:expires});
 const jar=await cookies();
 jar.set(cookieName,token,{httpOnly:true,secure:process.env.SESSION_COOKIE_SECURE==='true'||process.env.NODE_ENV==='production',sameSite:'lax',path:'/',expires});
 // A role hint is not authorization. It only chooses the signed-out starting screen.
 if(role==='ADMIN'||role==='COORDINATOR')jar.set('dm_staff_portal','1',{httpOnly:true,secure:process.env.SESSION_COOKIE_SECURE==='true'||process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:30*86400});
 else if(role==='CLIENT')jar.delete('dm_staff_portal');
}
export async function endSession(){const jar=await cookies();const token=jar.get(cookieName)?.value;if(token)await db.delete(sessions).where(eq(sessions.tokenHash,digest(token)));jar.delete(cookieName);}
export async function issueAuthToken(userId:string,purpose:'RESET'|'VERIFY',mins:number){
 const token=randomToken();await db.insert(authTokens).values({userId,purpose,tokenHash:digest(token),expiresAt:new Date(Date.now()+mins*60000)});return token;
}
export async function consumeAuthToken(token:string,purpose:'RESET'|'VERIFY'){
 const [entry]=await db.update(authTokens).set({usedAt:new Date()}).where(and(eq(authTokens.tokenHash,digest(token)),eq(authTokens.purpose,purpose),isNull(authTokens.usedAt),gt(authTokens.expiresAt,new Date()))).returning();
 if(!entry)throw new HttpError(400,'Link is invalid or expired');return entry.userId;
}

export async function checkAuthLimit(key: string, max = 8) {
  const k = digest(key).slice(0, 60);
  const until = new Date(Date.now() + 15 * 60_000);

  const [result] = await db
    .insert(authLimits)
    .values({
      key: k,
      attempts: 1,
      resetAt: until,
    })
    .onConflictDoUpdate({
      target: authLimits.key,
      set: {
        attempts: sql`
          CASE
            WHEN ${authLimits.resetAt} < NOW()
            THEN 1
            ELSE ${authLimits.attempts} + 1
          END
        `,
        resetAt: sql`
          CASE
            WHEN ${authLimits.resetAt} < NOW()
            THEN ${until.toISOString()}::timestamptz
            ELSE ${authLimits.resetAt}
          END
        `,
      },
    })
    .returning({
      attempts: authLimits.attempts,
    });

  if (result.attempts > max) {
    throw new HttpError(
      429,
      'Too many attempts. Try again in 15 minutes.'
    );
  }
}

export async function audit(actorId:string|null,action:string,targetType:string,targetId:string,details?:unknown){const {auditLogs}=await import('@/db/schema');await db.insert(auditLogs).values({actorId,action,targetType,targetId,details:details??null});}

export async function clearAuthLimit(key:string){await db.delete(authLimits).where(eq(authLimits.key,digest(key).slice(0,60)));}
