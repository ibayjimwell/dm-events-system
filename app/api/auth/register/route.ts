import {route,ok,readJson,HttpError} from '@/lib/http';
import {db} from '@/db';import {users} from '@/db/schema';import {registration} from '@/lib/validators';import {eq} from 'drizzle-orm';
import {hashPassword,issueAuthToken,createSession,checkAuthLimit} from '@/lib/auth';import {sendMail} from '@/lib/mail';
export const POST=route(async(req)=>{
 const data=registration.parse(await readJson(req));await checkAuthLimit('register:'+data.email,4);
 const existing=await db.select({id:users.id}).from(users).where(eq(users.email,data.email)).limit(1);
 if(existing.length)throw new HttpError(409,'Email address is already registered');
 if(process.env.EMAIL_VERIFICATION_REQUIRED==='true'&&(!process.env.PYTHON_MAIL_URL||!process.env.PYTHON_MAIL_SECRET))throw new HttpError(503,'Email verification delivery must be configured');
 const [user]=await db.insert(users).values({fullName:data.fullName,email:data.email,phone:data.phone||null,passwordHash:await hashPassword(data.password),emailVerifiedAt:process.env.EMAIL_VERIFICATION_REQUIRED==='true'?null:new Date()}).returning({id:users.id});
 if(process.env.EMAIL_VERIFICATION_REQUIRED==='true'){
  const token=await issueAuthToken(user.id,'VERIFY',60*24);
  await sendMail(data.email,'Verify your DM Events email',`Confirm your email address: ${process.env.APP_URL}/verify-email?token=${token}\nLink expires in 24 hours.`);
  return ok({verificationRequired:true,message:'Check your email to verify your account.'},201);
 }
 await createSession(user.id);return ok({user:{id:user.id,role:'CLIENT'},verificationRequired:false},201);
});
