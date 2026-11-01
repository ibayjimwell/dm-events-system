'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarCheck, CalendarClock, ClipboardList, Plus } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';
import { BookingEmpty, BookingHero, BookingPanel, BookingRecord, BookingSearch, BookingSummary, bookingStyles as s } from '@/components/ui/BookingSurface';

type Item = { id: string; reference: string; clientName: string; eventType: string; eventDate: string; status: string; source?: string; createdAt?: string; cancellationRequestedAt: string | null };
const statuses = ['ALL', 'TENTATIVE', 'HELD', 'CONFIRMED', 'CANCELLED'] as const;

export default function RequestList({ role, canCreateWalkIn = false }: { role: 'COORDINATOR' | 'ADMIN'; canCreateWalkIn?: boolean }) {
  const { data, loading, error, refresh } = useLiveQuery(() => api<{ bookings: Item[] }>('/api/bookings'), [],{cacheKey:'staff:/api/bookings',realtimeKinds:['bookings','booking_history']});
  const [query, setQuery] = useState('');
  const [order,setOrder] = useState<'NEWEST'|'EVENT_ASC'|'EVENT_DESC'>('NEWEST');
  const [status, setStatus] = useState('ALL');
  const [source, setSource] = useState('ALL');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('status') ?? '';
    if ([...statuses,'CANCELLATION_REQUESTED','ATTENTION'].includes(next)) setStatus(next);
    const sourceValue = params.get('source') ?? '';
    if (['ONLINE','WALK_IN'].includes(sourceValue)) setSource(sourceValue);
  }, []);
  const selectStatus = (next: string) => {
    setStatus(next);
    setQuery('');
    const url = new URL(window.location.href);
    if (next === 'ALL') url.searchParams.delete('status'); else url.searchParams.set('status',next);
    window.history.replaceState(window.history.state,'',url);
  };
  const bookings = data?.bookings ?? [];
  const visible = useMemo(() => bookings.filter(b => {
    const matchingText = `${b.reference} ${b.clientName} ${b.eventType}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchingText && (status === 'ALL' || status === 'CANCELLATION_REQUESTED' && !!b.cancellationRequestedAt || status === 'ATTENTION' && (b.status === 'TENTATIVE' || !!b.cancellationRequestedAt) || status === b.status)
      && (source === 'ALL' || source === b.source);
  }).sort((a,b)=>order==='EVENT_ASC'?a.eventDate.localeCompare(b.eventDate):order==='EVENT_DESC'?b.eventDate.localeCompare(a.eventDate):(b.createdAt ?? '').localeCompare(a.createdAt ?? '')), [bookings, query, status, source, order]);
  const base = role === 'ADMIN' ? '/admin/bookings' : '/coordinator/requests';
  const walkIn = role === 'ADMIN' ? '/admin/walk-in' : '/coordinator/walk-in';
  const needsAttention = bookings.filter(b => b.status === 'TENTATIVE' || !!b.cancellationRequestedAt).length;

  return <main className={s.page}><div className={s.shell}>
    <BookingHero eyebrow="DM Events · Booking operations" title={role === 'ADMIN' ? 'Booking management' : 'Event requests'} description="Keep every inquiry moving forward. Review client details, manage event statuses, and stay on top of requests requiring your attention." actions={canCreateWalkIn ? <Link className={s.heroLink} href={walkIn}><Plus size={16}/> New walk-in inquiry</Link> : undefined}/>
    <BookingSummary items={[
      { label: 'All requests', value: bookings.length, note: 'Online and walk-in inquiries', icon: <ClipboardList size={18}/>, onClick: () => selectStatus('ALL'), active: status==='ALL' },
      { label: 'Requires attention', value: needsAttention, note: 'Tentative or cancellation review', icon: <AlertCircle size={18}/>, onClick: () => selectStatus('ATTENTION'), active: status==='ATTENTION' },
      { label: 'On hold', value: bookings.filter(b => b.status === 'HELD').length, note: 'Dates temporarily reserved', icon: <CalendarClock size={18}/>, onClick: () => selectStatus('HELD'), active: status==='HELD' },
      { label: 'Confirmed', value: bookings.filter(b => b.status === 'CONFIRMED').length, note: 'Secured event dates', icon: <CalendarCheck size={18}/>, onClick: () => selectStatus('CONFIRMED'), active: status==='CONFIRMED' },
    ]}/>
    <BookingPanel title="All booking requests" description="Search, filter and open a booking for review." actions={<span className={s.muted}>{loading && data ? 'Refreshing…' : `${bookings.length} requests`}</span>}>
      <div className={s.toolbar}>
        <BookingSearch value={query} onChange={setQuery} placeholder="Search reference, client or event" />
        <select className={`${s.input} ${s.filter}`} aria-label="Filter booking status" value={status} onChange={e => selectStatus(e.target.value)}>
          {statuses.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          <option value="CANCELLATION_REQUESTED">Cancellation requests</option><option value="ATTENTION">Requires attention</option>
        </select>
        <select className={`${s.input} ${s.filter}`} aria-label="Sort bookings" value={order} onChange={event=>setOrder(event.target.value as typeof order)}><option value="NEWEST">Newest requests</option><option value="EVENT_ASC">Event date: soonest</option><option value="EVENT_DESC">Event date: latest</option></select>
        <select className={`${s.input} ${s.filter}`} aria-label="Filter booking source" value={source} onChange={e => setSource(e.target.value)}>
          <option value="ALL">Online & walk-in</option><option value="ONLINE">Online only</option><option value="WALK_IN">Walk-ins only</option>
        </select>
      </div>
      {error && <div role="alert" className={`${s.alert} ${s.alertDanger}`}>{error} <button className="underline" type="button" onClick={() => void refresh()}>Retry</button></div>}
      {loading && !data ? <ListSkeleton rows={5} label="Loading event requests" /> : <>
        <p className={s.resultCaption}>Showing {visible.length} of {bookings.length} requests</p>
        {visible.length ? <div className={s.list}>{visible.map(b => <BookingRecord key={b.id} href={`${base}/${b.id}`} reference={b.reference} title={b.eventType} subTitle={b.clientName} date={b.eventDate} status={b.status} source={b.source} cancellationRequested={!!b.cancellationRequestedAt}/>)}</div>
        : <BookingEmpty title={bookings.length ? 'No matching requests' : 'No booking requests yet'} description={bookings.length ? 'Try clearing your filters to see the other requests.' : 'New client inquiries and walk-in bookings will appear here.'} action={bookings.length ? <button type="button" className={s.recordAction} onClick={() => { setQuery(''); setStatus('ALL'); setSource('ALL'); }}>Clear filters</button> : undefined}/>}</>}
      <p className={`${s.helper} mt-5`}>Held and Confirmed bookings reserve their event date. Double-booking rules are enforced by the server.</p>
    </BookingPanel>
  </div></main>;
}
