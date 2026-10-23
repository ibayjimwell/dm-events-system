import {route,ok,readJson,HttpError} from '@/lib/http';import {requireActor,audit} from '@/lib/auth';import {readBooking} from '@/models/read';import {db} from '@/db';import {bookings} from '@/db/schema';import {eq} from 'drizzle-orm';import {z} from 'zod';
type Ctx={params:Promise<{id:string}>};
export const GET=route(async(_req,ctx:Ctx)=>{const u=await requireActor();const {id}=await ctx.params;return ok({booking:await readBooking(id,u)});});
export const PATCH=route(async(req,ctx:Ctx)=>{
 const u=await requireActor('CLIENT');const {id}=await ctx.params;const existing=await readBooking(id,u);
 if(!['TENTATIVE','HELD'].includes(existing.status))throw new HttpError(409,'This booking can no longer be edited');
 const v=z.object({preferredTheme:z.string().max(400),colorPalette:z.string().max(400),specialRequests:z.string().max(5000)}).parse(await readJson(req));
 await db.update(bookings).set({...v,updatedAt:new Date()}).where(eq(bookings.id,id));await audit(u.id,'PREFERENCES_UPDATED','booking',id);return ok({success:true});
});
