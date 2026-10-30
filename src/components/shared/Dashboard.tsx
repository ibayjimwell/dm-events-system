'use client';

import Link from 'next/link';
import type { Permission } from '@/lib/permissions';
import { CalendarDays, ArrowUpRight, MessageCircleMore, ClipboardList, CheckCircle2, Clock3, Sparkles, ShieldCheck, BarChart3, Package, UsersRound, CalendarPlus2, ArrowRight } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { StatSkeleton, ListSkeleton } from '@/components/ui/LoadingSkeleton';
import { Status, niceDate, money } from '@/components/ui/Blocks';

type Booking = { id:string; reference:string;clientName:string;eventType:string;eventDate:string;status:string };
type Summary = { counts:{all:number;confirmed:number;tentative:number;held:number;active:number;unread:number;monthlyValue:number};recent:Booking[] };
type Role = 'CLIENT'|'COORDINATOR'|'ADMIN';

type QuickAction = {label:string;detail:string;href:string;permission?:Permission;Icon:typeof CalendarDays};

export default function Dashboard({role,permissions=[]}:{role:Role;permissions?:Permission[]}) {
  const {data,loading,error,refresh} = useLiveQuery(()=>api<Summary>('/api/summary'),[],{cacheKey:`${role}:/api/summary`,realtimeKinds:['bookings','booking_history','messages','message_reads','booking_value_events']});
  const isClient = role==='CLIENT',isAdmin=role==='ADMIN';
  const title = isClient?'Your events, thoughtfully organized':isAdmin?'Your operations at a glance':'Your event coordination hub';
  const caption = isClient?'Follow each request, keep in touch with DM Events and plan what comes next.':isAdmin?'Monitor confirmed commitments, current inquiries and the next operational actions.':'Stay on top of incoming requests, scheduled dates and client communication.';
  const metrics = isClient ? [
    {label:'Active requests',value:data?.counts.active??0,detail:'Currently in review',Icon:ClipboardList},
    {label:'Confirmed bookings',value:data?.counts.confirmed??0,detail:'Secured event dates',Icon:CheckCircle2},
    {label:'Unread messages',value:data?.counts.unread??0,detail:'Conversation updates',Icon:MessageCircleMore},
  ] : isAdmin ? [
    {label:'Booking requests',value:data?.counts.all??0,detail:'All recorded inquiries',Icon:ClipboardList},
    {label:'Confirmed events',value:data?.counts.confirmed??0,detail:'Approved reservations',Icon:CheckCircle2},
    {label:'Monthly confirmed value',value:money(data?.counts.monthlyValue),detail:'Not cash received',Icon:BarChart3},
  ] : [
    {label:'New inquiries',value:data?.counts.tentative??0,detail:'Waiting for review',Icon:ClipboardList},
    {label:'Active requests',value:data?.counts.active??0,detail:'Tentative and held',Icon:Clock3},
    {label:'Confirmed events',value:data?.counts.confirmed??0,detail:'Booked on the calendar',Icon:CalendarDays},
  ];
  const actions:QuickAction[] = isClient ? [
    {label:'Book an event',detail:'Find the right package and date',href:'/client/book',permission:'bookings.create.own',Icon:CalendarPlus2},
    {label:'My bookings',detail:'Track requests and event details',href:'/client/bookings',permission:'bookings.view.own',Icon:ClipboardList},
    {label:'Messages',detail:'Talk to the DM Events team',href:'/client/messages',permission:'messages.own',Icon:MessageCircleMore},
  ] : isAdmin ? [
    {label:'Booking oversight',detail:'Review event requests',href:'/admin/bookings',permission:'bookings.view.all',Icon:ClipboardList},
    {label:'Monthly analytics',detail:'View confirmed-value movements',href:'/admin/analytics',permission:'analytics.view',Icon:BarChart3},
    {label:'Package library',detail:'Manage public packages',href:'/admin/maintenance/packages',permission:'packages.manage',Icon:Package},
    {label:'Staff and accounts',detail:'Manage authorized users',href:'/admin/maintenance/users',permission:'users.manage',Icon:UsersRound},
  ] : [
    {label:'Review requests',detail:'Manage incoming bookings',href:'/coordinator/requests',permission:'bookings.view.all',Icon:ClipboardList},
    {label:'Event calendar',detail:'Check reserved dates',href:'/coordinator/calendar',permission:'calendar.view',Icon:CalendarDays},
    {label:'Conversations',detail:'Reply to client questions',href:'/coordinator/messages',permission:'messages.staff',Icon:MessageCircleMore},
  ];
  const visibleActions=actions.filter(action=>!action.permission||permissions.includes(action.permission));
  const href=(booking:Booking)=>isClient?`/client/bookings/${booking.id}`:isAdmin?`/admin/bookings/${booking.id}`:`/coordinator/requests/${booking.id}`;
  const bookings=data?.recent??[];
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><Sparkles size={14}/>{isClient?'YOUR EVENT SPACE':isAdmin?'BUSINESS OVERVIEW':'EVENT OPERATIONS'}</span><h1>{title}</h1><p>{caption}</p></div><div className="workspace-hero__actions">{isClient&&permissions.includes('bookings.create.own')?<Link className="btn" href="/client/book"><CalendarPlus2 size={16}/> Request an event</Link>:<button className="btn btn-outline" onClick={()=>void refresh()} type="button"><ArrowUpRight size={16}/> Refresh overview</button>}</div></div></section>
    {error&&<p role="alert" className="workspace-banner workspace-banner--error workspace-section">{error}</p>}
    <div className="workspace-metrics" aria-label="Dashboard summary">{loading&&!data?<div className="col-span-full"><StatSkeleton/></div>:metrics.map(({label,value,detail,Icon})=><article key={label} className="workspace-metric workspace-reveal"><div className="workspace-metric__icon"><Icon size={19}/></div><div className="workspace-metric__label">{label}</div><div className="workspace-metric__value">{value}</div><div className="workspace-metric__hint">{detail}</div></article>)}</div>
    <div className="workspace-grid workspace-section">
      <section className="workspace-card"><div className="workspace-section__heading"><div><h2>{isClient?'Your latest requests':isAdmin?'Recent event requests':'Requests needing attention'}</h2><p>Stay informed about booking status and preferred event dates.</p></div>{!loading&&<span className="workspace-pill">{bookings.length} shown</span>}</div>
        {loading&&!data?<ListSkeleton label="Loading recent events" rows={4}/>:<div className="workspace-stack">{bookings.map(booking=>{
          const parts=booking.eventDate?.split('-');const month=parts?.length===3?new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString('en-PH',{month:'short'}):'Event';
          return <Link key={booking.id} href={href(booking)} className="workspace-event"><span className="workspace-event__date"><strong>{parts?.[2]||'—'}</strong><small>{month}</small></span><span className="flex-1"><span className="workspace-event__title">{booking.eventType||'Event booking'}</span><span className="workspace-event__meta">{booking.reference}{!isClient&&<> · {booking.clientName}</>}<br/>{niceDate(booking.eventDate)}</span></span><span className="flex flex-col items-end gap-2"><Status value={booking.status}/><ArrowRight size={16} className="text-[#7b9ab1]"/></span></Link>;
        })}{!bookings.length&&<div className="workspace-empty"><CalendarDays size={26} className="mx-auto text-[#8eabc0]"/><strong>No booking requests yet</strong>New requests will appear here as they are submitted.</div>}</div>}
        <p className="workspace-muted mt-5">{isClient?'A request is not confirmed until the team approves your date.':isAdmin?'Confirmed values represent commitments, not revenue or payment.':'Review each new inquiry before holding or confirming its date.'}</p>
      </section>
      <aside className="workspace-card"><div className="workspace-section__heading"><div><h2>Quick actions</h2><p>Go directly to the work that matters.</p></div></div><nav aria-label="Dashboard quick actions" className="workspace-stack">{visibleActions.map(({label,detail,href:target,Icon})=><Link key={target} href={target} className="workspace-action"><span className="workspace-action__icon"><Icon size={20}/></span><span className="flex-1"><strong>{label}</strong><small>{detail}</small></span><ArrowRight size={16} className="workspace-action__arrow"/></Link>)}{!visibleActions.length&&<div className="workspace-empty">No additional modules are assigned to this account.</div>}</nav></aside>
    </div>
    <div className="workspace-banner workspace-section"><ShieldCheck size={16} className="shrink-0"/><span>Event dates and booking statuses are synchronized with the secure booking records. Changes to your permissions are enforced by the server.</span></div>
  </main>;
}
