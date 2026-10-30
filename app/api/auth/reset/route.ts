import {route,ok,readJson,HttpError} from '@/lib/http';
import {db} from '@/db';
import {users,sessions,authTokens} from '@/db/schema';
import {newPassword} from '@/lib/validators';
import {hashPassword,digest,audit} from '@/lib/auth';
import {and,eq,gt,isNull} from 'drizzle-orm';
import {z} from 'zod';
export const POST=route(async(req)=>{
 const data=z.object({token:z.string().min(20),password:newPassword}).parse(await readJson(req));
 const hash=await hashPassword(data.password);
 const userId=await db.transaction(async(tx)=>{
   const [token]=await tx.update(authTokens).set({usedAt:new Date()}).where(and(
      eq(authTokens.tokenHash,digest(data.token)),eq(authTokens.purpose,'RESET'),
      isNull(authTokens.usedAt),gt(authTokens.expiresAt,new Date()),
   )).returning({userId:authTokens.userId});
   if(!token)throw new HttpError(400,'Reset link is invalid, expired or already used. Request a new one.');
   await tx.update(users).set({passwordHash:hash,updatedAt:new Date()}).where(eq(users.id,token.userId));
   await tx.delete(sessions).where(eq(sessions.userId,token.userId));
   await tx.update(authTokens).set({usedAt:new Date()}).where(and(eq(authTokens.userId,token.userId),isNull(authTokens.usedAt)));
   return token.userId;
 });
 await audit(userId,'PASSWORD_RESET','user',userId).catch(()=>{}); // Never fail a completed reset due to audit outage.
 return ok({success:true,message:'Password reset successfully. Sign in with the new password.'});
});
