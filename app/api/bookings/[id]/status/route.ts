import {requirePermission} from '@/lib/access';
import {notificationOutbox} from '@/db/schema';
import {notificationRows} from '@/lib/notifications/enqueue';
import {tryImmediateDelivery} from '@/lib/notifications/worker';
import {route,ok,readJson,HttpError} from '@/lib/http';import {requireActor,audit} from '@/lib/auth';import {statusInput} from '@/lib/validators';import {bookings,bookingHistory} from '@/db/schema';import {db} from '@/db';import {and,eq,ne,inArray,sql} from 'drizzle-orm';
export const POST=route(async(req,ctx:{params:Promise<{id:string}>})=>{
 const u=await requirePermission('bookings.status');const {id}=await ctx.params;const v=statusInput.parse(await readJson(req));
 const result=await db.transaction(async(tx)=>{
  const [b]=await tx.select().from(bookings).where(eq(bookings.id,id)).for('update');if(!b)throw new HttpError(404,'Booking not found');
  // Serialize decisions for the same event date to avoid simultaneous incompatible holds.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${b.eventDate}))`);
  if(b.status==='CANCELLED'&&v.status!=='CANCELLED')throw new HttpError(409,'Cancelled bookings may not be reactivated through this action');
  if(v.status==='CONFIRMED'&&(v.bookedValue===undefined||v.bookedValue===null)&&b.bookedValue===null)throw new HttpError(400,'Record an agreed booking value before confirming');
  if(v.status==='CONFIRMED'&&(v.bookedValue===null||(v.bookedValue===undefined?Number(b.bookedValue):v.bookedValue)<=0))throw new HttpError(400,'Booking value must be greater than zero');
  const conflicts=await tx.select({reference:bookings.reference,status:bookings.status,venue:bookings.venue}).from(bookings).where(and(eq(bookings.eventDate,b.eventDate),ne(bookings.id,id),inArray(bookings.status,['HELD','CONFIRMED'])));
  if(['HELD','CONFIRMED'].includes(v.status)&&conflicts.length&&!v.overrideConflict)throw new HttpError(409,`Potential date conflict: ${conflicts.map(x=>x.reference+' ('+x.status+')').join(', ')}. Review the calendar and explicitly acknowledge to continue.`);
  const newConfirmedAt=v.status==='CONFIRMED'?b.confirmedAt||new Date():null;
  await tx.update(bookings).set({status:v.status,reviewNote:v.note??b.reviewNote,bookedValue:v.bookedValue===undefined?b.bookedValue:v.bookedValue===null?null:String(v.bookedValue),confirmedAt:newConfirmedAt,updatedAt:new Date(),cancellationRequestedAt:v.status==='CANCELLED'?null:b.cancellationRequestedAt}).where(eq(bookings.id,id));
  const [history]=await tx.insert(bookingHistory).values({bookingId:id,actorId:u.id,fromStatus:b.status,toStatus:v.status,note:v.note||'Status updated',overrideConflict:v.overrideConflict}).returning({id:bookingHistory.id});
  const valueChanged = v.bookedValue!==undefined && (
    v.bookedValue===null ? b.bookedValue!==null : b.bookedValue===null || Number(b.bookedValue)!==v.bookedValue
  );
  const detailsChanged = (v.note!==undefined && v.note!==(b.reviewNote||'')) || valueChanged;
  const shouldNotify = b.status!==v.status || detailsChanged;
  if(shouldNotify){
    const kind=b.status!==v.status?'BOOKING_STATUS_CHANGED':'BOOKING_DETAILS_UPDATED';
    const notifications=notificationRows(b,kind,history.id,{status:v.status});
    if(notifications.length)await tx.insert(notificationOutbox).values(notifications).onConflictDoNothing();
  }
  return {status:v.status,conflicts,changed:shouldNotify};
 });
 await audit(u.id,'BOOKING_STATUS_UPDATED','booking',id,{status:v.status,overrideConflict:v.overrideConflict});
 if(result.changed)await tryImmediateDelivery(id);
 return ok(result);
});
