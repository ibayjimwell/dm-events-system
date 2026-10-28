import {can} from '@/lib/access';import {HttpError} from '@/lib/http';
import {route,ok} from '@/lib/http';import {db} from '@/db';import {bookingValueEvents} from '@/db/schema';import {sql} from 'drizzle-orm';import {manilaMonth} from '@/lib/confirmedValue';import {requireActor} from '@/lib/auth';import {readBookings,unreadCount} from '@/models/read';
export const GET=route(async()=>{
 const u=await requireActor();if(!await can(u,'dashboard.client')&&!await can(u,'dashboard.coordinator')&&!await can(u,'dashboard.admin'))throw new HttpError(403,'Dashboard access denied');const rows=await readBookings(u);
 const all=rows.length,confirmed=rows.filter(x=>x.status==='CONFIRMED').length,tentative=rows.filter(x=>x.status==='TENTATIVE').length,held=rows.filter(x=>x.status==='HELD').length;
 const unread=await unreadCount(u);
 const month=manilaMonth();
 const [valueRow]=await (await can(u,'analytics.view') ? db.select({amount:sql<string>`coalesce(sum(${bookingValueEvents.amountDelta}),0)::text`}).from(bookingValueEvents).where(sql`to_char(${bookingValueEvents.recordedAt} AT TIME ZONE 'Asia/Manila','YYYY-MM')=${month}`) : Promise.resolve([{amount:'0'}]));
 const monthlyValue=Number(valueRow?.amount||0);
 return ok({counts:{all,confirmed,tentative,held,active:tentative+held,unread,monthlyValue},recent:rows.slice(0,8)});
});
