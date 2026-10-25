import {requirePermission} from '@/lib/access';
import {route,ok,HttpError} from '@/lib/http';import {requireActor} from '@/lib/auth';import {db} from '@/db';import {bookings} from '@/db/schema';import {and,gte,lte,asc} from 'drizzle-orm';
export const GET=route(async(req)=>{
 await requirePermission('calendar.view');const month=new URL(req.url).searchParams.get('month')||new Date().toISOString().slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new HttpError(400,'Invalid month');const [y,m]=month.split('-').map(Number);const end=new Date(Date.UTC(y,m,0)).getUTCDate();
 const rows=await db.select({id:bookings.id,reference:bookings.reference,eventType:bookings.eventType,eventDate:bookings.eventDate,venue:bookings.venue,status:bookings.status}).from(bookings).where(and(gte(bookings.eventDate,`${month}-01`),lte(bookings.eventDate,`${month}-${String(end).padStart(2,'0')}`))).orderBy(asc(bookings.eventDate));
 return ok({month,bookings:rows});
});
