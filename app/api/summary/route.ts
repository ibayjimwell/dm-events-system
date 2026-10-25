import {can} from '@/lib/access';import {HttpError} from '@/lib/http';
import {route,ok} from '@/lib/http';import {requireActor} from '@/lib/auth';import {readBookings,unreadCount} from '@/models/read';
export const GET=route(async()=>{
 const u=await requireActor();if(!await can(u,'dashboard.client')&&!await can(u,'dashboard.coordinator')&&!await can(u,'dashboard.admin'))throw new HttpError(403,'Dashboard access denied');const rows=await readBookings(u);
 const all=rows.length,confirmed=rows.filter(x=>x.status==='CONFIRMED').length,tentative=rows.filter(x=>x.status==='TENTATIVE').length,held=rows.filter(x=>x.status==='HELD').length;
 const unread=await unreadCount(u);const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
 const monthlyValue=rows.filter(x=>x.status==='CONFIRMED'&&x.confirmedAt&&new Date(x.confirmedAt).toISOString().slice(0,7)===today.slice(0,7)).reduce((sum,x)=>sum+Number(x.bookedValue||0),0);
 return ok({counts:{all,confirmed,tentative,held,active:tentative+held,unread,monthlyValue},recent:rows.slice(0,8)});
});
