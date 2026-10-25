import {route,ok,readJson,HttpError} from '@/lib/http';import {db} from '@/db';import {users} from '@/db/schema';import {eq} from 'drizzle-orm';import {issueAuthToken,checkAuthLimit} from '@/lib/auth';import {sendMail} from '@/lib/mail';import {z} from 'zod';
export const POST=route(async(req)=>{
 const {email}=z.object({email:z.string().trim().toLowerCase().email()}).parse(await readJson(req));
 await checkAuthLimit('forgot:'+email,3);
 if(!process.env.PYTHON_MAIL_URL||!process.env.PYTHON_MAIL_SECRET)throw new HttpError(503,'Password recovery email service has not been configured');
 const [user]=await db.select().from(users).where(eq(users.email,email)).limit(1);
 if(user){const token=await issueAuthToken(user.id,'RESET',30);await sendMail(email,'Reset your DM Events password',`Reset your password using this one-time link: ${process.env.APP_URL}/reset-password?token=${token}\nExpires in 30 minutes.`);}
 return ok({message:'If the email exists, a reset link has been sent.'});
});
