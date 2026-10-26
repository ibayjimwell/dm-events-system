import {route,ok,readJson,HttpError} from '@/lib/http';import {db} from '@/db';import {users} from '@/db/schema';import {login} from '@/lib/validators';import {eq} from 'drizzle-orm';import {comparePassword,createSession,checkAuthLimit,clearAuthLimit,audit} from '@/lib/auth';
export const POST=route(async(req)=>{
 const data=login.parse(await readJson(req));await checkAuthLimit('login:'+data.email,10);
 const [u]=await db.select().from(users).where(eq(users.email,data.email)).limit(1);
 if(!u || !u.isActive || !await comparePassword(data.password,u.passwordHash))throw new HttpError(401,'Invalid email or password');
 if(process.env.EMAIL_VERIFICATION_REQUIRED==='true'&&!u.emailVerifiedAt)throw new HttpError(403,'Email not verified. Check your email or request another verification link.');
 await clearAuthLimit('login:'+data.email);await createSession(u.id,u.role);await audit(u.id,'LOGIN','user',u.id);return ok({user:{id:u.id,fullName:u.fullName,email:u.email,role:u.role}});
});
