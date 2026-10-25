import {requirePermission} from '@/lib/access';
import {route,ok,readJson,HttpError} from '@/lib/http';import {requireActor,audit} from '@/lib/auth';import {readBooking} from '@/models/read';import {bookings} from '@/db/schema';import {db} from '@/db';import {eq} from 'drizzle-orm';import {z} from 'zod';
export const POST=route(async(req,ctx:{params:Promise<{id:string}>})=>{
 const u=await requirePermission('bookings.cancel.own');const {id}=await ctx.params;const b=await readBooking(id,u);if(b.clientId!==u.id)throw new HttpError(403,'Only the booking owner may request cancellation');
 if(b.status==='CANCELLED')throw new HttpError(409,'Booking already cancelled');
 if(b.cancellationRequestedAt)throw new HttpError(409,'A cancellation request already exists');
 const {reason}=z.object({reason:z.string().trim().min(3).max(2000)}).parse(await readJson(req));
 await db.update(bookings).set({cancellationRequestedAt:new Date(),cancellationReason:reason,updatedAt:new Date()}).where(eq(bookings.id,id));
 await audit(u.id,'CANCELLATION_REQUESTED','booking',id,{reason});return ok({success:true,message:'Cancellation request sent for coordinator review. Booking status has not changed.'});
});
