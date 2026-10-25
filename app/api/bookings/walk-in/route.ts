import {randomBytes} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {db} from '@/db';
import {bookings,bookingHistory,packages,mediaAssets} from '@/db/schema';
import {requirePermission} from '@/lib/access';
import {audit} from '@/lib/auth';
import {route,ok,readJson,HttpError} from '@/lib/http';
import {walkInBookingInput} from '@/lib/validators';
/** Walk-ins have NO users row and NO impersonated session. */
export const POST=route(async(req)=>{
 const staff=await requirePermission('bookings.create.walkin');
 const v=walkInBookingInput.parse(await readJson(req));
 if(v.eventDate<new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}))throw new HttpError(400,'Choose today or a future date');
 if(v.packageId){const [p]=await db.select().from(packages).where(and(eq(packages.id,v.packageId),eq(packages.published,true)));if(!p)throw new HttpError(400,'Package unavailable');}
 if(v.inspirationAssetId){const [a]=await db.select().from(mediaAssets).where(and(eq(mediaAssets.id,v.inspirationAssetId),eq(mediaAssets.uploadedBy,staff.id),eq(mediaAssets.kind,'INSPIRATION')));if(!a||a.bookingId)throw new HttpError(400,'Inspiration photo unavailable');}
 const reference=`DEM-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
 const [booking]=await db.transaction(async tx=>{
  const [row]=await tx.insert(bookings).values({reference,source:'WALK_IN',clientId:null,createdBy:staff.id,contactName:v.contactName,contactEmail:v.contactEmail,contactPhone:v.contactPhone,eventType:v.eventType,eventDate:v.eventDate,guestCount:v.guestCount,venue:v.venue,estimatedBudget:v.estimatedBudget,packageId:v.packageId||null,preferredTheme:v.preferredTheme,colorPalette:v.colorPalette,specialRequests:v.specialRequests,inspirationAssetId:v.inspirationAssetId||null,privacyConsentedAt:new Date()}).returning();
  await tx.insert(bookingHistory).values({bookingId:row.id,actorId:staff.id,toStatus:'TENTATIVE',note:'Walk-in inquiry recorded by authorized staff; client has no website account'});
  if(v.inspirationAssetId)await tx.update(mediaAssets).set({bookingId:row.id}).where(eq(mediaAssets.id,v.inspirationAssetId));
  return [row];
 });
 await audit(staff.id,'WALK_IN_BOOKING_CREATED','booking',booking.id,{reference,clientName:v.contactName,consentRecorded:true});
 return ok({booking},201);
});
