import {route,ok,readJson,HttpError} from '@/lib/http';import {requireActor,audit} from '@/lib/auth';import {bookingInput} from '@/lib/validators';import {db} from '@/db';import {bookings,bookingHistory,mediaAssets,packages} from '@/db/schema';import {eq,and} from 'drizzle-orm';import {readBookings} from '@/models/read';import {randomBytes} from 'node:crypto';
export const GET=route(async()=>{const u=await requireActor();return ok({bookings:await readBookings(u)});});
export const POST=route(async(req)=>{
 const u=await requireActor('CLIENT');const v=bookingInput.parse(await readJson(req));
 if(v.eventDate<new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}))throw new HttpError(400,'Choose today or a future date');
 if(v.packageId){const [p]=await db.select().from(packages).where(and(eq(packages.id,v.packageId),eq(packages.published,true)));if(!p)throw new HttpError(400,'Package unavailable');}
 if(v.inspirationAssetId){const [a]=await db.select().from(mediaAssets).where(and(eq(mediaAssets.id,v.inspirationAssetId),eq(mediaAssets.uploadedBy,u.id),eq(mediaAssets.kind,'INSPIRATION')));if(!a||a.bookingId)throw new HttpError(400,'Inspiration image unavailable');}
 const ref=`DEM-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
 const [created]=await db.transaction(async(tx)=>{
  const [b]=await tx.insert(bookings).values({reference:ref,clientId:u.id,contactName:v.contactName,contactEmail:v.contactEmail,contactPhone:v.contactPhone,eventType:v.eventType,eventDate:v.eventDate,guestCount:v.guestCount,venue:v.venue,estimatedBudget:v.estimatedBudget,packageId:v.packageId||null,preferredTheme:v.preferredTheme,colorPalette:v.colorPalette,specialRequests:v.specialRequests,inspirationAssetId:v.inspirationAssetId||null,privacyConsentedAt:new Date()}).returning();
  await tx.insert(bookingHistory).values({bookingId:b.id,actorId:u.id,toStatus:'TENTATIVE',note:'Client booking inquiry submitted'});
  if(v.inspirationAssetId)await tx.update(mediaAssets).set({bookingId:b.id}).where(eq(mediaAssets.id,v.inspirationAssetId));
  return [b];
 });await audit(u.id,'BOOKING_CREATED','booking',created.id,{reference:ref});return ok({booking:created},201);
});
