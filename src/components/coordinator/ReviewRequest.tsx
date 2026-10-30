'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, MessageCircle, ShieldCheck } from 'lucide-react';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import { money, niceDate } from '@/components/ui/Blocks';
import BookingChangeDialog, { type BookingChange } from '@/components/ui/BookingChangeDialog';
import { BookingSavedDialog } from '@/components/ui/BookingFeedback';
import EventScheduleEditor from '@/components/coordinator/EventScheduleEditor';
import { BookingHero, BookingStatus, BookingPanel, BookingInfoGrid, BookingTimeline, bookingStyles as s } from '@/components/ui/BookingSurface';

type Detail = {
  id: string; reference: string; eventType: string; eventDate: string; venue: string; guestCount: number;
  estimatedBudget: string; preferredTheme: string; colorPalette: string; specialRequests: string;
  inspirationAssetId: string | null; status: 'TENTATIVE' | 'HELD' | 'CONFIRMED' | 'CANCELLED';
  bookedValue: string | null; updatedAt: string;
  eventStartTime: string | null; eventEndTime: string | null;
  assignedCoordinatorId: string | null; scheduleNotes: string;
  reviewNote: string | null; cancellationRequestedAt: string | null; cancellationReason: string | null;
  client: { fullName: string; email: string; phone: string | null };
  package: { name: string } | null;
  history: { id: string; toStatus: string; note: string | null; actorName: string; createdAt: string }[];
};

export default function ReviewRequest({ id, role, canUpdateStatus = true, canMessage = true, canViewList = true }: {
  id: string; role: 'COORDINATOR' | 'ADMIN'; canUpdateStatus?: boolean; canMessage?: boolean; canViewList?: boolean;
}) {
  const router = useRouter();
  const listHref = role === 'ADMIN' ? '/admin/bookings' : '/coordinator/requests';
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedChanges, setSavedChanges] = useState<BookingChange[]>([]);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const { data, loading, error, refresh } = useLiveQuery(() => api<{ booking: Detail }>(`/api/bookings/${id}`), [id],{cacheKey:`staff:/api/bookings/${id}`,realtimeKinds:['bookings','booking_history']});
  const booking = data?.booking;
  const [status, setStatus] = useState<Detail['status']>('TENTATIVE');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [formTouched, setFormTouched] = useState(false);
  const [editingVersion, setEditingVersion] = useState('');
  const markEdited = () => { if (!formTouched) setEditingVersion(booking?.updatedAt ?? ''); setFormTouched(true); };

  useEffect(() => {
    if (booking && !formTouched) {
      setStatus(booking.status); setValue(booking.bookedValue || '');
      setNote(booking.reviewNote || ''); setEditingVersion(booking.updatedAt);
    }
  }, [booking?.id, booking?.status, booking?.bookedValue, booking?.reviewNote, booking?.updatedAt, formTouched]);

  const normalizedAmount = value.trim() === '' ? null : Number(value);
  const changes: BookingChange[] = booking ? [
    ...(status !== booking.status ? [{ label: 'Booking status', before: booking.status, after: status }] : []),
    ...(Number(booking.bookedValue ?? 0) !== Number(normalizedAmount ?? 0) || (booking.bookedValue === null) !== (normalizedAmount === null)
      ? [{ label: 'Agreed booking value', before: booking.bookedValue === null ? 'Not set' : money(booking.bookedValue), after: normalizedAmount === null ? 'Not set' : money(normalizedAmount) }] : []),
    ...(note.trim() !== (booking.reviewNote || '').trim() ? [{ label: 'Coordinator notes / client update', before: booking.reviewNote || 'Not set', after: note.trim() || 'Not set' }] : []),
  ] : [];

  function previewSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setResult('');
    if (!booking || busy) return;
    if (normalizedAmount !== null && (!Number.isFinite(normalizedAmount) || normalizedAmount < 0)) { setResult('Enter a valid nonnegative booking value.'); return; }
    if (status === 'CONFIRMED' && (!normalizedAmount || normalizedAmount <= 0)) { setResult('A positive agreed booking value is required to confirm an event.'); return; }
    if (!changes.length) { setResult('No changes to save.'); return; }
    setConfirmationOpen(true);
  }

  async function save() {
    if (busy || !confirmationOpen || !booking) return;
    setBusy(true); setResult('');
    const changesToSave = changes.map(change => ({ ...change }));
    try {
      await api(`/api/bookings/${id}/status`, json('POST', {
        status, bookedValue: normalizedAmount, note: note.trim(), overrideConflict: false,
        expectedUpdatedAt: editingVersion || booking.updatedAt,
      }));
      setConfirmationOpen(false); setFormTouched(false); setEditingVersion('');
      setSavedChanges(changesToSave); setSavedOpen(true); await refresh();
    } catch (caught) {
      setResult(caught instanceof Error ? caught.message : 'Unable to save status.');
    } finally { setBusy(false); }
  }

  return <main className={s.page}><div className={s.shell}>
    <BookingHero eyebrow="DM Events · Booking operations" backHref={canViewList ? listHref : undefined}
      backLabel={role === 'ADMIN' ? 'All bookings' : 'Event requests'}
      title={booking?.eventType || 'Review event request'}
      description={booking ? `${booking.reference} · Review details, coordinate schedules, and update booking decisions.` : 'Loading booking details…'}
      actions={booking && <BookingStatus value={booking.status}/>}
    >{booking && <div className={s.detailHeroGrid}>
      <div className={s.heroFact}><small>Preferred date</small><strong>{niceDate(booking.eventDate)}</strong></div>
      <div className={s.heroFact}><small>Client</small><strong>{booking.client.fullName}</strong></div>
      <div className={s.heroFact}><small>Agreed booking value</small><strong>{booking.bookedValue ? money(booking.bookedValue) : 'Not set'}</strong></div>
    </div>}</BookingHero>
    {error && <div role="alert" className={`${s.alert} ${s.alertDanger} mt-5`}>{error}<button type="button" className="underline" onClick={() => void refresh()}>Retry</button></div>}
    {loading && !booking ? <div className="mt-5"><DetailSkeleton/></div> : booking && <div className={s.detailLayout}>
      <div className={s.stack}>
        <BookingPanel title="Event information" description="Review the inquiry before making a decision.">
          <BookingInfoGrid items={[
            { label: 'Event type', value: booking.eventType },
            { label: 'Preferred date', value: niceDate(booking.eventDate) },
            { label: 'Event time', value: booking.eventStartTime && booking.eventEndTime ? `${booking.eventStartTime} – ${booking.eventEndTime}` : 'Not scheduled' },
            { label: 'Venue', value: booking.venue },
            { label: 'Expected guests', value: booking.guestCount },
            { label: 'Estimated budget', value: booking.estimatedBudget },
            { label: 'Preferred package', value: booking.package?.name },
            { label: 'Theme', value: booking.preferredTheme },
            { label: 'Color palette', value: booking.colorPalette },
            { label: 'Special requests', value: booking.specialRequests },
          ]}/>
        </BookingPanel>
        <BookingPanel title="Client contact" description="Details to use when following up on this request.">
          <BookingInfoGrid items={[
            { label: 'Full name', value: booking.client.fullName },
            { label: 'Email address', value: booking.client.email },
            { label: 'Contact number', value: booking.client.phone },
          ]}/>
          {canMessage && <Link href={role === 'ADMIN' ? `/admin/messages?booking=${id}` : `/coordinator/messages?booking=${id}`} className={`${s.actionLink} mt-5`}><MessageCircle size={16}/> Message client <ArrowRight size={16}/></Link>}
        </BookingPanel>
        {booking.inspirationAssetId && <BookingPanel title="Client inspiration" description="Visual inspiration submitted with the booking.">
          <a href={`/api/assets/${booking.inspirationAssetId}`} target="_blank" rel="noreferrer" className={s.photoFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.photo} src={`/api/assets/${booking.inspirationAssetId}`} alt="Client inspiration" loading="lazy"/>
          </a><p className={`${s.helper} mt-3`}>Select the image to open it in full size.</p>
        </BookingPanel>}
        <BookingPanel title="Booking activity" description="Recorded status decisions and staff notes."><BookingTimeline history={booking.history}/></BookingPanel>
      </div>
      <aside className={s.stack}>
        {booking.cancellationRequestedAt && <div className={`${s.alert} ${s.alertWarn}`} role="status"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><span><strong>Cancellation requested</strong><br/>{booking.cancellationReason || 'The client requested cancellation.'} Review this request before updating the booking status.</span></div>}
        <BookingPanel title="Booking decision" description="Update status, agreed value and client-visible notes.">
          <div className={`${s.alert} mb-5`}><ShieldCheck size={18} className="mt-0.5 shrink-0"/><span>Held and Confirmed bookings exclusively reserve their date. Server-side double-booking protection remains active.</span></div>
          {canUpdateStatus ? <form onSubmit={previewSave} className={s.form}>
            <div><label htmlFor="booking-review-status">Booking status</label><select id="booking-review-status" className={s.input} value={status} onChange={e => { setStatus(e.target.value as Detail['status']); markEdited(); }}>
              <option value="TENTATIVE" disabled={booking.status === 'CONFIRMED' || booking.status === 'CANCELLED'}>Tentative · Awaiting review</option>
              <option value="HELD" disabled={booking.status === 'CONFIRMED' || booking.status === 'CANCELLED'}>Held · Reserve date</option>
              <option value="CONFIRMED" disabled={booking.status === 'CANCELLED'}>Confirmed · Event secured</option>
              <option value="CANCELLED">Cancelled · Release date</option>
            </select></div>
            <div><label htmlFor="booking-review-value">Agreed value (PHP)</label><input id="booking-review-value" className={s.input} type="number" min="0" step="0.01" value={value} onChange={e => { setValue(e.target.value); markEdited(); }} placeholder="Required for confirmation"/></div>
            <div><label htmlFor="booking-review-note">Notes / client update</label><textarea id="booking-review-note" className={s.input} rows={4} value={note} onChange={e => { setNote(e.target.value); markEdited(); }} placeholder="Record a decision, instructions or next steps"/></div>
            <p className={s.helper}>The new status and agreed value are recorded only after you review and confirm your changes.</p>
            <button className={`${s.actionLink} w-full`} type="submit" disabled={busy || changes.length === 0}><CheckCircle2 size={16}/>{busy ? 'Saving changes…' : `Review ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`}</button>
            {result && <div role="alert" className={`${s.alert} ${s.alertDanger}`}>{result}</div>}
          </form> : <div className={s.alert}>You can review this request, but your account cannot change its booking status.</div>}
        </BookingPanel>
        <BookingPanel title="Event scheduling" description="Organize the event timeline, assigned Coordinator and private notes.">
          <EventScheduleEditor booking={booking} canEdit={canUpdateStatus} onSaved={refresh}/>
        </BookingPanel>
        {canViewList && <Link className={`${s.actionLink} ${s.actionLinkSecondary}`} href={listHref}><ArrowLeft size={16}/> Back to booking requests</Link>}
      </aside>
    </div>}
    <BookingChangeDialog open={confirmationOpen} reference={booking?.reference ?? ''} changes={changes} busy={busy} error={result} onCancel={() => setConfirmationOpen(false)} onConfirm={() => void save()}/>
    <BookingSavedDialog open={savedOpen} reference={booking?.reference ?? ''} changes={savedChanges} canReturnToList={canViewList} onContinue={() => { setSavedOpen(false); if (canViewList) router.push(listHref); }}/>
  </div></main>;
}
