'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck, CalendarClock, ClipboardList, Plus, ShieldCheck } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';
import { BookingEmpty, BookingHero, BookingRecord, BookingSearch, BookingSummary, BookingPanel, bookingStyles as s } from '@/components/ui/BookingSurface';

type Item = { id: string; reference: string; eventType: string; eventDate: string; status: string; venue: string; createdAt?: string; source?: string };
const tabs = ['ALL', 'TENTATIVE', 'HELD', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;

export default function BookingList() {
  const { data, loading, error, refresh } = useLiveQuery(() => api<{ bookings: Item[] }>('/api/bookings'), [],{cacheKey:'client:/api/bookings',realtimeKinds:['bookings','booking_history']});
  const [query, setQuery] = useState('');
  const [order,setOrder] = useState<'NEWEST'|'EVENT_ASC'|'EVENT_DESC'>('NEWEST');
  const [status, setStatus] = useState<string>('ALL');
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('status');
    if (next && [...tabs,'ACTIVE'].includes(next)) setStatus(next);
  }, []);
  const selectStatus = (next: string) => {
    setStatus(next);
    setQuery('');
    const url = new URL(window.location.href);
    if (next === 'ALL') url.searchParams.delete('status'); else url.searchParams.set('status',next);
    window.history.replaceState(window.history.state,'',url);
  };
  const bookings = data?.bookings ?? [];
  const visible = useMemo(() => bookings.filter(booking => {
    const text = `${booking.reference} ${booking.eventType} ${booking.venue || ''}`.toLowerCase();
    return (status === 'ALL' || (status === 'ACTIVE' ? ['HELD','CONFIRMED'].includes(booking.status) : status === booking.status)) && text.includes(query.trim().toLowerCase());
  }).sort((a,b)=>order==='EVENT_ASC'?a.eventDate.localeCompare(b.eventDate):order==='EVENT_DESC'?b.eventDate.localeCompare(a.eventDate):(b.createdAt ?? '').localeCompare(a.createdAt ?? '')), [bookings, query, status, order]);
  const counts = { upcoming: bookings.filter(b => b.status === 'HELD' || b.status === 'CONFIRMED').length, tentative: bookings.filter(b => b.status === 'TENTATIVE').length, confirmed: bookings.filter(b => b.status === 'CONFIRMED').length };

  return <main className={s.page}><div className={s.shell}>
    <BookingHero eyebrow="Client portal · My events" title="Your event requests" description="Everything about your event, beautifully organized. Keep track of each inquiry, review updates, and connect with your coordinator." actions={<Link href="/client/book" className={s.heroLink}><Plus size={16}/> Request an event</Link>}/>
    <BookingSummary items={[
      { label: 'Total requests', value: bookings.length, note: 'Across all booking statuses', icon: <ClipboardList size={18}/>, onClick: () => selectStatus('ALL'), active: status==='ALL' },
      { label: 'Being reviewed', value: counts.tentative, note: 'Awaiting review', icon: <CalendarClock size={18}/>, onClick: () => selectStatus('TENTATIVE'), active: status==='TENTATIVE' },
      { label: 'Reserved or confirmed', value: counts.upcoming, note: 'Dates held or secured', icon: <ShieldCheck size={18}/>, onClick: () => selectStatus('ACTIVE'), active: status==='ACTIVE' },
      { label: 'Confirmed events', value: counts.confirmed, note: 'Ready for coordination', icon: <CalendarCheck size={18}/>, onClick: () => selectStatus('CONFIRMED'), active: status==='CONFIRMED' },
    ]}/>
    <BookingPanel title="Booking library" description="Find and open your event requests, or start planning something new." actions={<span className={s.muted}>{loading && data ? 'Refreshing…' : `${bookings.length} total`}</span>}>
      <div className={s.toolbar}>
        <BookingSearch value={query} onChange={setQuery} placeholder="Search reference, event or venue" />
        <select aria-label="Filter bookings by status" className={`${s.input} ${s.filter}`} value={status} onChange={event => selectStatus(event.target.value)}>
          <option value="ACTIVE">Reserved or confirmed</option>{tabs.map(tab => <option value={tab} key={tab}>{tab === 'ALL' ? 'All statuses' : tab.charAt(0) + tab.slice(1).toLowerCase()}</option>)}
        </select>
        <select className={`${s.input} ${s.filter}`} aria-label="Sort bookings" value={order} onChange={event=>setOrder(event.target.value as typeof order)}><option value="NEWEST">Newest requests</option><option value="EVENT_ASC">Event date: soonest</option><option value="EVENT_DESC">Event date: latest</option></select>
      </div>
      {error && <div role="alert" className={`${s.alert} ${s.alertDanger}`}>{error} <button type="button" className="underline" onClick={() => void refresh()}>Retry</button></div>}
      {loading && !data ? <ListSkeleton rows={5} label="Loading your bookings" /> : <>
        <p className={s.resultCaption}>Showing {visible.length} of {bookings.length} requests</p>
        {visible.length ? <div className={s.list}>{visible.map(booking => <BookingRecord key={booking.id} href={`/client/bookings/${booking.id}`} reference={booking.reference} title={booking.eventType} subTitle={booking.venue || 'Venue to be confirmed'} date={booking.eventDate} status={booking.status}/>)}</div>
          : <BookingEmpty title={bookings.length ? 'No matching bookings' : 'Your story begins here'} description={bookings.length ? 'Try a different search or status to find your request.' : 'When you submit an event inquiry, you can follow every update from this space.'} action={bookings.length ? <button type="button" className={s.recordAction} onClick={() => { setQuery(''); setStatus('ALL'); }}>Clear filters <ArrowRight size={15}/></button> : <Link className={s.actionLink} href="/client/book">Plan an event <ArrowRight size={15}/></Link>}/>}
      </>}
      <p className={`${s.helper} mt-5`}>An inquiry does not reserve an event date until DM Events marks it as Held or Confirmed.</p>
    </BookingPanel>
  </div></main>;
}
