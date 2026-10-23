import {route,ok,readJson} from '@/lib/http';import {db} from '@/db';import {users,sessions} from '@/db/schema';import {newPassword} from '@/lib/validators';import {consumeAuthToken,hashPassword,audit} from '@/lib/auth';import {eq} from 'drizzle-orm';import {z} from 'zod';
export const POST=route(async(req)=>{
 const data=z.object({token:z.string().min(20),password:newPassword}).parse(await readJson(req));const id=await consumeAuthToken(data.token,'RESET');
 await db.update(users).set({passwordHash:await hashPassword(data.password),updatedAt:new Date()}).where(eq(users.id,id));
 await db.delete(sessions).where(eq(sessions.userId,id));await audit(id,'PASSWORD_RESET','user',id);return ok({success:true});
});
