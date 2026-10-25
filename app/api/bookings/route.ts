import {route,ok,readJson,HttpError} from '@/lib/http';
import {requireActor,audit,checkAuthLimit} from '@/lib/auth';
import {requirePermission,can} from '@/lib/access';
import {bookingInput} from '@/lib/validators';
import {db} from '@/db';
import {bookings,bookingHistory,mediaAssets,packages} from '@/db/schema';
import {eq,and} from 'drizzle-orm';
import {readBookings} from '@/models/read';
import {randomBytes} from 'node:crypto';
import {notificationOutbox} from '@/db/schema';
import {notificationRows} from '@/lib/notifications/enqueue';
import {tryImmediateDelivery} from '@/lib/notifications/worker';

export const GET=route(async()=>{
  const user=await requireActor();
  if(!await can(user,'bookings.view.all')&&!await can(user,'bookings.view.own'))throw new HttpError(403,'Booking access denied');
  return ok({bookings:await readBookings(user)});
});

export const POST=route(async(req)=>{
  const user=await requirePermission('bookings.create.own');
  // The personal-booking route always ties an online request to its own login.
  if(user.role!=='CLIENT')throw new HttpError(403,'Use Walk-in Booking for customers without an account');
  const values=bookingInput.parse(await readJson(req));
  if(values.eventDate<new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}))throw new HttpError(400,'Choose today or a future date');
  if(values.packageId){const [pkg]=await db.select().from(packages).where(and(eq(packages.id,values.packageId),eq(packages.published,true)));if(!pkg)throw new HttpError(400,'Package unavailable');}
  if(values.inspirationAssetId){const [asset]=await db.select().from(mediaAssets).where(and(eq(mediaAssets.id,values.inspirationAssetId),eq(mediaAssets.uploadedBy,user.id),eq(mediaAssets.kind,'INSPIRATION')));if(!asset||asset.bookingId)throw new HttpError(400,'Inspiration image unavailable');}
  await checkAuthLimit('online-booking:'+user.id,5); // Max 5 submissions per 15 minutes.
  const reference=`DEM-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const [created]=await db.transaction(async tx=>{
    const [booking]=await tx.insert(bookings).values({reference,source:'ONLINE',createdBy:user.id,clientId:user.id,contactName:values.contactName,contactEmail:values.contactEmail,contactPhone:values.contactPhone,eventType:values.eventType,eventDate:values.eventDate,guestCount:values.guestCount,venue:values.venue,estimatedBudget:values.estimatedBudget,packageId:values.packageId||null,preferredTheme:values.preferredTheme,colorPalette:values.colorPalette,specialRequests:values.specialRequests,inspirationAssetId:values.inspirationAssetId||null,privacyConsentedAt:new Date()}).returning();
    await tx.insert(bookingHistory).values({bookingId:booking.id,actorId:user.id,toStatus:'TENTATIVE',note:'Client booking inquiry submitted'});
    if(values.inspirationAssetId)await tx.update(mediaAssets).set({bookingId:booking.id}).where(eq(mediaAssets.id,values.inspirationAssetId));
    const notifications = notificationRows(booking, 'BOOKING_CREATED', booking.id);
    if(notifications.length) await tx.insert(notificationOutbox).values(notifications).onConflictDoNothing();
    return [booking];
  });
  await audit(user.id,'BOOKING_CREATED','booking',created.id,{reference,source:'ONLINE'});
  await tryImmediateDelivery(created.id);
  return ok({booking:created},201);
});
