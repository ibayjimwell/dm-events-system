import {can} from '@/lib/access';
import {requirePermission} from '@/lib/access';
import {route,ok,readJson,HttpError} from '@/lib/http';import {requireActor,audit} from '@/lib/auth';import {readBooking} from '@/models/read';import {db} from '@/db';import {bookings} from '@/db/schema';import {eq} from 'drizzle-orm';import {z} from 'zod';
type Ctx={params:Promise<{id:string}>};
export const GET=route(async(_req,ctx:Ctx)=>{const u=await requireActor();if(!await can(u,'bookings.view.all')&&!await can(u,'bookings.view.own'))throw new HttpError(403,'Booking access denied');const {id}=await ctx.params;return ok({booking:await readBooking(id,u)});});
export const PATCH=route(async(req,ctx:Ctx)=>{
 const u=await requirePermission('bookings.edit.own');const {id}=await ctx.params;const existing=await readBooking(id,u);if(existing.clientId!==u.id)throw new HttpError(403,'Only the booking owner may edit preferences');
 if(!['TENTATIVE','HELD'].includes(existing.status))throw new HttpError(409,'This booking can no longer be edited');
 const v=z.object({preferredTheme:z.string().max(400),colorPalette:z.string().max(400),specialRequests:z.string().max(5000)}).parse(await readJson(req));
 await db.update(bookings).set({...v,updatedAt:new Date()}).where(eq(bookings.id,id));await audit(u.id,'PREFERENCES_UPDATED','booking',id);return ok({success:true});
});
