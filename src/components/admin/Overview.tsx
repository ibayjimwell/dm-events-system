'use client';

import Link from 'next/link';
import type { Permission } from '@/lib/permissions';
import { ClipboardList, CalendarCheck2, ChartNoAxesCombined, ArrowRight, Package, UsersRound, Globe, Database, ShieldCheck, BarChart3 } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { StatSkeleton, ListSkeleton } from '@/components/ui/LoadingSkeleton';
import { money } from '@/components/ui/Blocks';

type Summary={counts:{all:number;confirmed:number;monthlyValue:number;unread:number}};
type Analytics={monthly:{month:string;count:number;amount:string}[]};
const monthLabel=(value:string)=>new Date(`${value}-01T12:00:00`).toLocaleDateString('en-PH',{month:'long',year:'numeric'});

export default function Overview({permissions=[]}:{permissions?:Permission[]}) {
  const canAnalytics=permissions.includes('analytics.view');
  const summary=useLiveQuery(()=>api<Summary>('/api/summary'),[],{cacheKey:'admin:/api/summary',realtimeKinds:['bookings','booking_history','messages','message_reads','booking_value_events']});
  const analytics=useLiveQuery(()=>canAnalytics?api<Analytics>('/api/analytics'):Promise.resolve({monthly:[]}),[canAnalytics],{cacheKey:canAnalytics?'admin:/api/analytics':undefined,realtimeKinds:['bookings','booking_history','booking_value_events']});
  const counts=summary.data?.counts;
  const months=analytics.data?.monthly.slice(-6).reverse()??[];
  const actions=[
    {label:'Booking oversight',detail:'Review and manage requests',href:'/admin/bookings',p:'bookings.view.all',Icon:ClipboardList},
    {label:'Monthly analytics',detail:'Audit confirmed-value movements',href:'/admin/analytics',p:'analytics.view',Icon:BarChart3},
    {label:'Website content',detail:'Edit public homepage sections',href:'/admin/maintenance/content',p:'content.manage',Icon:Globe},
    {label:'Packages',detail:'Manage visible event packages',href:'/admin/maintenance/packages',p:'packages.manage',Icon:Package},
    {label:'Accounts & access',detail:'Assign employee permissions',href:'/admin/maintenance/users',p:'users.manage',Icon:UsersRound},
    {label:'Backup history',detail:'Review off-site backup activity',href:'/admin/maintenance/backups',p:'backups.manage',Icon:Database},
  ].filter(action=>permissions.includes(action.p as Permission));
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><ShieldCheck size={14}/> ADMINISTRATOR WORKSPACE</span><h1>Business operations overview</h1><p>See confirmed commitments, incoming requests and the modules available to your account.</p></div>{permissions.includes('bookings.view.all')&&<div className="workspace-hero__actions"><Link href="/admin/bookings" className="btn"><ClipboardList size={16}/> Open bookings</Link></div>}</div></section>
    {summary.error&&<p role="alert" className="workspace-banner workspace-banner--error workspace-section">{summary.error}</p>}
    {analytics.error&&<p role="alert" className="workspace-banner workspace-banner--error workspace-section">{analytics.error}</p>}
    <div className="workspace-metrics">{summary.loading&&!summary.data?<div className="col-span-full"><StatSkeleton/></div>:[
      {label:'Total event requests',value:counts?.all??0,hint:'All recorded inquiries',Icon:ClipboardList},
      {label:'Confirmed bookings',value:counts?.confirmed??0,hint:'Approved event dates',Icon:CalendarCheck2},
      {label:'Monthly confirmed value',value:money(counts?.monthlyValue),hint:'Commitments, not cash received',Icon:ChartNoAxesCombined},
    ].map(({label,value,hint,Icon})=><article key={label} className="workspace-metric"><div className="workspace-metric__icon"><Icon size={20}/></div><div className="workspace-metric__label">{label}</div><div className="workspace-metric__value">{value}</div><div className="workspace-metric__hint">{hint}</div></article>)}</div>
    <div className="workspace-grid workspace-section">
      <section className="workspace-card"><div className="workspace-section__heading"><div><h2>Monthly operations snapshot</h2><p>Confirmed-value movements in Philippine time.</p></div>{canAnalytics&&<Link href="/admin/analytics" className="workspace-pill">Detailed report <ArrowRight size={13}/></Link>}</div>
        {analytics.loading&&!analytics.data&&canAnalytics?<ListSkeleton label="Loading operations snapshot" rows={4}/>:months.length?<div className="workspace-stack">{months.map(month=><div key={month.month} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2eaf0] bg-[#f8fbfd] px-4 py-3"><div><strong className="text-sm text-[#173b58]">{monthLabel(month.month)}</strong><p className="workspace-muted">{month.count} new confirmations</p></div><strong className="text-base text-[#0b4d98]">{money(month.amount)}</strong></div>)}</div>:<div className="workspace-empty"><BarChart3 className="mx-auto text-[#91aac0]" size={27}/><strong>{canAnalytics?'No monthly movements yet':'Analytics access not assigned'}</strong>{canAnalytics?'Monthly figures appear after confirmed-value movements are recorded.':'Only authorized roles can view financial reporting.'}</div>}
        <p className="workspace-muted mt-4">Negative movements are reductions or reversals in the month recorded; this is not a cash-flow statement.</p>
      </section>
      <aside className="workspace-card"><div className="workspace-section__heading"><div><h2>Management tools</h2><p>Only authorized modules are displayed.</p></div></div><nav className="workspace-stack" aria-label="Authorized management modules">{actions.map(({label,detail,href,Icon})=><Link key={href} href={href} className="workspace-action"><span className="workspace-action__icon"><Icon size={19}/></span><span className="flex-1"><strong>{label}</strong><small>{detail}</small></span><ArrowRight className="workspace-action__arrow" size={16}/></Link>)}</nav></aside>
    </div>
  </main>;
}
