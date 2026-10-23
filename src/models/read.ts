import {db} from '@/db';import {bookings,packages,users,bookingHistory,messages,messageReads,siteContent} from '@/db/schema';
import {and,eq,desc,ne,gt,sql,asc} from 'drizzle-orm';import type {Actor} from '@/lib/auth';import {HttpError} from '@/lib/http';
export async function readBookings(user:Actor){
 const query=db.select({id:bookings.id,reference:bookings.reference,clientId:bookings.clientId,clientName:users.fullName,contactName:bookings.contactName,eventType:bookings.eventType,eventDate:bookings.eventDate,venue:bookings.venue,status:bookings.status,packageId:bookings.packageId,bookedValue:bookings.bookedValue,confirmedAt:bookings.confirmedAt,cancellationRequestedAt:bookings.cancellationRequestedAt,updatedAt:bookings.updatedAt,createdAt:bookings.createdAt}).from(bookings).innerJoin(users,eq(users.id,bookings.clientId));
 return user.role==='CLIENT'?query.where(eq(bookings.clientId,user.id)).orderBy(desc(bookings.createdAt)):query.orderBy(desc(bookings.createdAt));
}
export async function readBooking(id:string,user:Actor){
 const [item]=await db.select({booking:bookings,client: {id:users.id,fullName:users.fullName,email:users.email,phone:users.phone}}).from(bookings).innerJoin(users,eq(users.id,bookings.clientId)).where(eq(bookings.id,id)).limit(1);
 if(!item || user.role==='CLIENT'&&item.booking.clientId!==user.id)throw new HttpError(404,'Booking not found');
 const [history,packageInfo]=await Promise.all([db.select({id:bookingHistory.id,fromStatus:bookingHistory.fromStatus,toStatus:bookingHistory.toStatus,note:bookingHistory.note,createdAt:bookingHistory.createdAt,actorName:users.fullName}).from(bookingHistory).innerJoin(users,eq(users.id,bookingHistory.actorId)).where(eq(bookingHistory.bookingId,id)).orderBy(desc(bookingHistory.createdAt)), item.booking.packageId?db.select().from(packages).where(eq(packages.id,item.booking.packageId)).limit(1):Promise.resolve([])]);
 return {...item.booking,client:item.client,package:packageInfo[0]||null,history};
}
export async function readConversation(bookingId:string,user:Actor){await readBooking(bookingId,user);return db.select({id:messages.id,bookingId:messages.bookingId,senderId:messages.senderId,senderName:users.fullName,senderRole:users.role,body:messages.body,assetId:messages.assetId,createdAt:messages.createdAt}).from(messages).innerJoin(users,eq(users.id,messages.senderId)).where(eq(messages.bookingId,bookingId)).orderBy(asc(messages.createdAt));}
export async function unreadCount(user:Actor){
 const visible=await readBookings(user);const ids=visible.map(x=>x.id);if(!ids.length)return 0;
 const counts=await Promise.all(ids.map(async id=>{
  const [read]=await db.select().from(messageReads).where(and(eq(messageReads.bookingId,id),eq(messageReads.userId,user.id))).limit(1);
  const where=and(eq(messages.bookingId,id),ne(messages.senderId,user.id),read?gt(messages.createdAt,read.lastReadAt):undefined);
  const [total]=await db.select({count:sql<number>`count(*)::int`}).from(messages).where(where);return total?.count||0;
 }));return counts.reduce((a,b)=>a+b,0);
}
export async function currentSite(){const [c]=await db.select().from(siteContent).where(eq(siteContent.id,'main')).limit(1);return c||null;}
