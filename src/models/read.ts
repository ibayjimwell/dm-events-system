import {db} from '@/db';import {bookings,packages,users,bookingHistory,messages,messageReads,siteContent} from '@/db/schema';
import {and,eq,desc,ne,gt,sql,asc} from 'drizzle-orm';import type {Actor} from '@/lib/auth';import {HttpError} from '@/lib/http';import {can} from '@/lib/access';
export async function readBookings(user:Actor){
 const query=db.select({id:bookings.id,reference:bookings.reference,clientId:bookings.clientId,clientName:sql<string>`coalesce(${users.fullName},${bookings.contactName})`,contactName:bookings.contactName,eventType:bookings.eventType,eventDate:bookings.eventDate,venue:bookings.venue,source:bookings.source,status:bookings.status,packageId:bookings.packageId,bookedValue:bookings.bookedValue,confirmedAt:bookings.confirmedAt,cancellationRequestedAt:bookings.cancellationRequestedAt,updatedAt:bookings.updatedAt,createdAt:bookings.createdAt}).from(bookings).leftJoin(users,eq(users.id,bookings.clientId));
 return await can(user,'bookings.view.all')?query.orderBy(desc(bookings.createdAt)):query.where(eq(bookings.clientId,user.id)).orderBy(desc(bookings.createdAt));
}
export async function readBooking(id:string,user:Actor){
 const [item]=await db.select({booking:bookings,client: {id:users.id,fullName:users.fullName,email:users.email,phone:users.phone}}).from(bookings).leftJoin(users,eq(users.id,bookings.clientId)).where(eq(bookings.id,id)).limit(1);
 if(!item || (item.booking.clientId!==user.id && !await can(user,'bookings.view.all')))throw new HttpError(404,'Booking not found');
 const [history,packageInfo]=await Promise.all([db.select({id:bookingHistory.id,fromStatus:bookingHistory.fromStatus,toStatus:bookingHistory.toStatus,note:bookingHistory.note,createdAt:bookingHistory.createdAt,actorName:users.fullName}).from(bookingHistory).innerJoin(users,eq(users.id,bookingHistory.actorId)).where(eq(bookingHistory.bookingId,id)).orderBy(desc(bookingHistory.createdAt)), item.booking.packageId?db.select().from(packages).where(eq(packages.id,item.booking.packageId)).limit(1):Promise.resolve([])]);
 return {...item.booking,scheduleNotes:await can(user,'bookings.review')?item.booking.scheduleNotes:'',assignedCoordinatorId:await can(user,'bookings.review')?item.booking.assignedCoordinatorId:null,client:item.booking.clientId?item.client:{id:null,fullName:item.booking.contactName,email:item.booking.contactEmail,phone:item.booking.contactPhone},package:packageInfo[0]||null,history};
}
export async function readConversation(bookingId:string,user:Actor){await readBooking(bookingId,user);return db.select({id:messages.id,bookingId:messages.bookingId,senderId:messages.senderId,senderName:users.fullName,senderRole:users.role,body:messages.body,assetId:messages.assetId,createdAt:messages.createdAt}).from(messages).innerJoin(users,eq(users.id,messages.senderId)).where(eq(messages.bookingId,bookingId)).orderBy(asc(messages.createdAt));}
export async function unreadCount(user:Actor){
 // One aggregate query; avoids one lookup and one count per booking in large systems.
 const hasAll = await can(user,'bookings.view.all');
 const [row] = await db.select({count:sql<number>`count(*)::int`})
  .from(messages)
  .innerJoin(bookings,eq(bookings.id,messages.bookingId))
  .leftJoin(messageReads,and(eq(messageReads.bookingId,messages.bookingId),eq(messageReads.userId,user.id)))
  .where(and(ne(messages.senderId,user.id),
   sql`(${messageReads.lastReadAt} IS NULL OR ${messages.createdAt} > ${messageReads.lastReadAt})`,
   hasAll?undefined:eq(bookings.clientId,user.id)));
 return row?.count||0;
}
export async function currentSite(){const [c]=await db.select().from(siteContent).where(eq(siteContent.id,'main')).limit(1);return c||null;}
