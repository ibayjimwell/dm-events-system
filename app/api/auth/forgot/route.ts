import {route,ok,readJson,HttpError} from '@/lib/http';
import {db} from '@/db';
import {users,authTokens} from '@/db/schema';
import {and,eq,isNull} from 'drizzle-orm';
import {issueAuthToken,checkAuthLimit} from '@/lib/auth';
import {sendMail} from '@/lib/mail';
import {z} from 'zod';
export const POST=route(async(req)=>{
 const {email}=z.object({email:z.string().trim().toLowerCase().email()}).parse(await readJson(req));
 await checkAuthLimit('forgot:'+email,3);
 if(!process.env.PYTHON_MAIL_URL||!process.env.PYTHON_MAIL_SECRET||!process.env.APP_URL)
   throw new HttpError(503,'Password recovery email is not configured.');
 const [user]=await db.select({id:users.id,email:users.email,isActive:users.isActive}).from(users).where(eq(users.email,email)).limit(1);
 if(user?.isActive){
   // Existing reset links expire when a new link is requested.
   await db.update(authTokens).set({usedAt:new Date()}).where(and(eq(authTokens.userId,user.id),eq(authTokens.purpose,'RESET'),isNull(authTokens.usedAt)));
   const token=await issueAuthToken(user.id,'RESET',30);
   const link=new URL('/reset-password',process.env.APP_URL);link.searchParams.set('token',token);
   try { await sendMail(user.email,'Reset your DM Events password',
     `Reset your password using this one-time link: ${link.toString()}\nExpires in 30 minutes. If you did not request this, ignore the email.`); }
   catch { await db.update(authTokens).set({usedAt:new Date()}).where(eq(authTokens.tokenHash,(await import('@/lib/auth')).digest(token))); throw new HttpError(503,'Password reset email could not be sent. Please try again.'); }
 }
 return ok({message:'If an active account exists, password reset instructions have been sent.'});
});
