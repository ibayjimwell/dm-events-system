'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { BarChart3, ArrowDownRight, ArrowUpRight, Download, History, Info, CalendarRange } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import { money, niceDate } from '@/components/ui/Blocks';

type Month = { month:string;amount:string;gross:string;reductions:string;count:number };
type Movement = { id:string;reference:string;eventType:string;eventDate:string;recordedAt:string;movementType:'CONFIRMATION'|'ADJUSTMENT'|'REVERSAL';amountDelta:string;valueAfter:string };
type Report = { monthly:Month[]; details:Movement[];reportBasis:string };
type Filter = 'ALL'|Movement['movementType'];
const monthInManila = (stamp:string) => {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).formatToParts(new Date(stamp));
  return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`;
};
const fullMonth = (month:string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-PH',{month:'long',year:'numeric'});

export default function Analytics({ canExport=true }: { canExport?:boolean }) {
  const {data,loading,error} = useLiveQuery(()=>api<Report>('/api/analytics'),[]);
  const [selected,setSelected] = useState('');
  const [movementFilter,setMovementFilter] = useState<Filter>('ALL');
  const months = data?.monthly ?? [];
  const chosen = selected && months.some(m=>m.month===selected) ? selected : months.at(-1)?.month ?? '';
  const current = months.find(m=>m.month===chosen);
  const points = months.map(m=>({month:m.month,label:new Date(`${m.month}-01T12:00:00`).toLocaleDateString('en-PH',{month:'short',year:'2-digit'}),value:Number(m.amount),count:m.count}));
  const details = useMemo(()=>data?.details.filter(d=>monthInManila(d.recordedAt)===chosen && (movementFilter==='ALL'||d.movementType===movementFilter))??[],[data,chosen,movementFilter]);
  const moneyValue = (value: string | undefined) => money(value ?? '0');
  const label = current ? fullMonth(current.month) : 'No recorded month';

  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><BarChart3 size={14}/> MANAGEMENT REPORTING</span><h1>Monthly confirmed value</h1><p>Review confirmations, adjustments and cancellations as dated financial movements. These commitments are not payments, revenue or profit.</p></div>{canExport&&<div className="workspace-hero__actions"><a className="btn" href="/api/report.csv"><Download size={16}/> Export CSV</a></div>}</div></section>
    <div className="workspace-banner workspace-section"><Info size={17} className="shrink-0"/><span>{data?.reportBasis??'Reports reflect recorded confirmed-value commitments, not cash collected. Historic bookings imported to the ledger have an opening baseline.'}</span></div>
    {error&&<p className="workspace-banner workspace-banner--error workspace-section" role="alert">{error}</p>}
    {loading&&!data?<div className="workspace-section"><DetailSkeleton label="Loading confirmed-value analytics"/></div>:<>
      <section className="workspace-section"><div className="workspace-section__heading"><div><h2>Reporting period</h2><p>Amounts are grouped using Philippine local time.</p></div><label className="flex items-center gap-2 text-xs font-semibold text-[#516b82]"><CalendarRange size={16}/> Month <select className="workspace-input !w-auto" aria-label="Reporting month" value={chosen} onChange={e=>setSelected(e.target.value)} disabled={!months.length}>{months.map(m=><option key={m.month} value={m.month}>{fullMonth(m.month)}</option>)}</select></label></div>
        <div className="workspace-metrics" style={{marginTop:0}}>
          <div className="workspace-metric"><div className="workspace-metric__icon"><BarChart3 size={20}/></div><div className="workspace-metric__label">Net movement · {label}</div><div className="workspace-metric__value">{moneyValue(current?.amount)}</div><div className="workspace-metric__hint">After increases and reductions</div></div>
          <div className="workspace-metric"><div className="workspace-metric__icon"><ArrowUpRight size={20}/></div><div className="workspace-metric__label">Positive movements</div><div className="workspace-metric__value">{moneyValue(current?.gross)}</div><div className="workspace-metric__hint">{current?.count??0} new confirmations this month</div></div>
          <div className="workspace-metric"><div className="workspace-metric__icon"><ArrowDownRight size={20}/></div><div className="workspace-metric__label">Reductions & reversals</div><div className="workspace-metric__value">{moneyValue(current?.reductions)}</div><div className="workspace-metric__hint">Adjustments are not backdated</div></div>
        </div>
      </section>
      <section className="workspace-section workspace-card"><div className="workspace-section__heading"><div><h2>Monthly movement trend</h2><p>Net recorded changes in confirmed event commitments.</p></div></div>
        {points.length?<div role="img" aria-label="Bar chart of monthly net confirmed-value changes" className="h-[320px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={points} margin={{top:12,right:10,left:5,bottom:6}}><CartesianGrid vertical={false} stroke="#e2eaf1"/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#657c91'}}/><YAxis tickFormatter={(value:number)=>`₱${(value/1000).toFixed(0)}k`} width={67} tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#657c91'}}/><Tooltip formatter={value=>money(Number(value))} contentStyle={{borderRadius:12,border:'1px solid #dae4ed'}}/><ReferenceLine y={0} stroke="#93aac0"/><Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={62}>{points.map(point=><Cell key={point.month} fill={point.month===chosen?'#0b4d98':point.value<0?'#d58a72':'#8db6d6'}/>)}</Bar></BarChart></ResponsiveContainer></div>:<div className="workspace-empty"><BarChart3 size={26} className="mx-auto text-[#91aac0]"/><strong>No recorded movements yet</strong>Confirm an event to begin the monthly history.</div>}
      </section>
      <section className="workspace-section workspace-card"><div className="workspace-section__heading"><div><span className="workspace-kicker" style={{color:'#357aa5'}}><History size={14}/> AUDIT HISTORY</span><h2 className="mt-2">Value movements · {label}</h2><p>Each entry shows when the business commitment changed.</p></div>
        <select className="workspace-input !w-auto" aria-label="Filter movement type" value={movementFilter} onChange={e=>setMovementFilter(e.target.value as Filter)}><option value="ALL">All movements</option><option value="CONFIRMATION">Confirmations</option><option value="ADJUSTMENT">Adjustments</option><option value="REVERSAL">Reversals</option></select></div>
        <div className="workspace-table"><table><thead><tr><th>Booking reference</th><th>Event</th><th>Event date</th><th>Recorded (PH)</th><th>Movement</th><th>Change</th></tr></thead><tbody>{details.map(item=><tr key={item.id}><td className="font-semibold text-[#0b4d98]">{item.reference}</td><td>{item.eventType}</td><td>{niceDate(item.eventDate)}</td><td>{new Date(item.recordedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</td><td><span className={`workspace-pill ${item.movementType==='REVERSAL'?'workspace-pill--bad':item.movementType==='CONFIRMATION'?'workspace-pill--good':'workspace-pill--warn'}`}>{item.movementType}</span></td><td className="font-bold">{money(item.amountDelta)}</td></tr>)}</tbody></table></div>
        {details.length===0&&<div className="workspace-empty mt-3">No value movements match the selected month and filter.</div>}
      </section>
    </>}
  </main>;
}
