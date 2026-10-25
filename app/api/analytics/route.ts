import {requirePermission} from '@/lib/access';
import {route,ok} from '@/lib/http';import {requireActor} from '@/lib/auth';import {db} from '@/db';import {bookings} from '@/db/schema';import {eq,desc,sql} from 'drizzle-orm';
export const GET=route(async()=>{
 await requirePermission('analytics.view');
 const rows=await db.select({month:sql<string>`to_char(${bookings.confirmedAt} AT TIME ZONE 'Asia/Manila','YYYY-MM')`,amount:sql<string>`coalesce(sum(${bookings.bookedValue}),0)::text`,count:sql<number>`count(*)::int`}).from(bookings).where(eq(bookings.status,'CONFIRMED')).groupBy(sql`to_char(${bookings.confirmedAt} AT TIME ZONE 'Asia/Manila','YYYY-MM')`).orderBy(desc(sql`to_char(${bookings.confirmedAt} AT TIME ZONE 'Asia/Manila','YYYY-MM')`));
 const details=await db.select({id:bookings.id,reference:bookings.reference,eventType:bookings.eventType,eventDate:bookings.eventDate,confirmedAt:bookings.confirmedAt,bookedValue:bookings.bookedValue}).from(bookings).where(eq(bookings.status,'CONFIRMED')).orderBy(desc(bookings.confirmedAt));
 return ok({monthly:rows.reverse(),details,reportBasis:'Confirmation month (Asia/Manila). Confirmed booking value, NOT cash collected, revenue or profit.'});
});
