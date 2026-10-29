'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Clock3, MapPin, UserRound, ArrowRight, CalendarCheck2, Info } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import { Status, niceDate } from '@/components/ui/Blocks';

type Event = { id:string;reference:string;eventType:string;eventDate:string;venue:string;status:string;eventStartTime:string|null;eventEndTime:string|null;coordinatorName:string|null };
const daysOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const isoManila = () => new Intl.DateTimeFormat('en-CA',{ timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());

export default function Calendar({ role = 'COORDINATOR' }: { role?: 'COORDINATOR'|'ADMIN' }) {
  const [month, setMonth] = useState(() => isoManila().slice(0,7));
  const [chosen, setChosen] = useState('');
  const { data, error, loading } = useLiveQuery(() => api<{ bookings:Event[] }>(`/api/calendar?month=${month}`), [month]);
  const [year, index] = month.split('-').map(Number);
  const today = isoManila();
  const selected = chosen || (month === today.slice(0,7) ? today : `${month}-01`);
  const monthName = new Date(year,index-1,1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  const dayCount = new Date(year,index,0).getDate();
  const initialOffset = new Date(year,index-1,1).getDay();
  const eventsByDate = useMemo(() => {
    const map = new Map<string,Event[]>();
    for (const event of data?.bookings ?? []) map.set(event.eventDate,[...(map.get(event.eventDate) ?? []),event]);
    return map;
  },[data]);
  const selectedEvents = eventsByDate.get(selected) ?? [];
  const counts = {confirmed:(data?.bookings ?? []).filter(b => b.status==='CONFIRMED').length, held:(data?.bookings ?? []).filter(b => b.status==='HELD').length, tentative:(data?.bookings ?? []).filter(b => b.status==='TENTATIVE').length};
  const changeMonth = (by:number) => { const next = new Date(year,index-1+by,1);setMonth(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`);setChosen(''); };
  const detailUrl = (id:string) => `${role === 'ADMIN' ? '/admin/bookings' : '/coordinator/requests'}/${id}`;

  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><CalendarDays size={14}/> EVENT OPERATIONS</span><h1>Event schedule</h1><p>Plan confidently with a live view of requests, reserved dates, confirmed events and assigned coordinators.</p></div><div className="workspace-hero__actions"><button type="button" className="btn btn-outline" onClick={() => {setMonth(today.slice(0,7));setChosen(today);}}><CalendarCheck2 size={16}/> Today</button></div></div></section>
    {error && <p role="alert" className="workspace-banner workspace-banner--error workspace-section">{error}</p>}
    <section className="workspace-section workspace-metrics" aria-label="Monthly event summary">
      {[{label:'Confirmed events',value:counts.confirmed,description:'Approved for this month',tone:'workspace-pill--good'}, {label:'Dates on hold',value:counts.held,description:'Temporarily reserved',tone:''},{label:'Pending inquiries',value:counts.tentative,description:'Awaiting review',tone:'workspace-pill--warn'}].map(metric => <div key={metric.label} className="workspace-metric"><div className={`workspace-pill ${metric.tone}`}>{metric.label}</div><div className="workspace-metric__value">{loading && !data ? '—' : metric.value}</div><div className="workspace-metric__hint">{metric.description}</div></div>)}
    </section>
    {loading && !data ? <div className="workspace-section"><DetailSkeleton label="Loading event calendar" /></div> :
      <div className="workspace-grid workspace-section">
        <section className="workspace-card" aria-label="Monthly event calendar">
          <div className="workspace-section__heading"><div><h2>{monthName}</h2><p>Select any date to view its bookings and assigned team.</p></div><div className="flex items-center gap-2"><button className="btn btn-ghost btn-small" type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={17}/></button><button className="btn btn-ghost btn-small" type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={17}/></button></div></div>
          <div className="workspace-calendar mb-2">{daysOfWeek.map(day => <div key={day} className="text-center text-[10px] font-semibold uppercase tracking-wider text-[#71869a]">{day}</div>)}</div>
          <div className="workspace-calendar" role="group" aria-label={`${monthName} dates`}>
            {Array.from({length:initialOffset},(_,i) => <span aria-hidden="true" key={`blank-${i}`} />)}
            {Array.from({length:dayCount},(_,i) => {
              const date = `${month}-${String(i+1).padStart(2,'0')}`;
              const items = eventsByDate.get(date) ?? [];
              return <button type="button" key={date} onClick={() => setChosen(date)} aria-pressed={date===selected} aria-label={`${niceDate(date)}: ${items.length} event requests`} className={`workspace-calendar__day ${date===today?'is-today':''}`}><span className="workspace-calendar__number">{i+1}</span><span className="flex flex-wrap gap-1" aria-hidden="true">{items.slice(0,4).map(event => <span key={event.id} className={`workspace-calendar__dot workspace-calendar__dot--${event.status}`} />)}</span><span className="workspace-calendar__count">{items.length ? `${items.length} request${items.length!==1?'s':''}` : 'Available'}</span></button>;
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#637c93]">{[['CONFIRMED','Confirmed'],['HELD','Held'],['TENTATIVE','Tentative'],['CANCELLED','Cancelled']].map(([status,label]) => <span className="inline-flex items-center gap-2" key={status}><span className={`workspace-calendar__dot workspace-calendar__dot--${status}`} />{label}</span>)}</div>
        </section>
        <aside className="workspace-stack"><section className="workspace-card" aria-live="polite"><div className="workspace-section__heading"><div><h2>{niceDate(selected)}</h2><p>{selectedEvents.length} booking request{selectedEvents.length===1?'':'s'} on this date</p></div></div>
            <div className="workspace-stack">{selectedEvents.length ? selectedEvents.map(event => <Link className="workspace-event" href={detailUrl(event.id)} key={event.id}><div className="workspace-event__date"><CalendarDays size={20} className="mx-auto text-[#0b4d83]" /></div><div className="flex-1"><div className="workspace-event__title">{event.eventType} · {event.reference}</div><div className="workspace-event__meta"><Clock3 size={12} className="inline"/> {event.eventStartTime && event.eventEndTime ? `${event.eventStartTime}–${event.eventEndTime}` : 'Time not scheduled'}<br/><UserRound size={12} className="inline"/> {event.coordinatorName || 'Coordinator not assigned'}{event.venue && <><br/><MapPin size={12} className="inline"/> {event.venue}</>}</div><div className="mt-2"><Status value={event.status}/></div></div><ArrowRight className="shrink-0 text-[#7c9ab2]" size={17}/></Link>) : <div className="workspace-empty"><CalendarDays size={26} className="mx-auto text-[#91aac0]"/><strong>No events on this date</strong>Choose another day to see planned activity.</div>}</div>
          </section><div className="workspace-banner"><Info size={17} className="shrink-0"/><span>Only one Held or Confirmed booking is permitted for a date. Multiple Tentative inquiries may be listed while awaiting review.</span></div>
          {selectedEvents.filter(event=>event.status==='HELD'||event.status==='CONFIRMED').length>1&& <div role="alert" className="workspace-banner workspace-banner--warning">Multiple reserved bookings exist on this date. Resolve the conflict before changing reservations.</div>}
        </aside>
      </div>}
  </main>;
}
