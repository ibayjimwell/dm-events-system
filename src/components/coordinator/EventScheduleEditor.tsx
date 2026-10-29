'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, json } from '@/api-client/http';
import { InlineSkeleton } from '@/components/ui/LoadingSkeleton';
import BookingChangeDialog, { type BookingChange } from '@/components/ui/BookingChangeDialog';
import { bookingStyles as s } from '@/components/ui/BookingSurface';
import { AlertCircle, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';

type Schedule = {
  id: string; reference: string; status: string; updatedAt: string;
  eventStartTime: string | null; eventEndTime: string | null;
  assignedCoordinatorId: string | null; scheduleNotes: string;
};
type Coordinator = { id: string; name: string };
export default function EventScheduleEditor({ booking, canEdit, onSaved }: {
  booking: Schedule; canEdit: boolean; onSaved: () => Promise<void>;
}) {
  const [staff, setStaff] = useState<Coordinator[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [start, setStart] = useState(booking.eventStartTime ?? '');
  const [end, setEnd] = useState(booking.eventEndTime ?? '');
  const [assigned, setAssigned] = useState(booking.assignedCoordinatorId ?? '');
  const [notes, setNotes] = useState(booking.scheduleNotes ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    let alive = true;
    void api<{ coordinators: Coordinator[] }>('/api/coordinators')
      .then(result => { if (alive) setStaff(result.coordinators); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load coordinators'); })
      .finally(() => { if (alive) setStaffLoading(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    setStart(booking.eventStartTime ?? ''); setEnd(booking.eventEndTime ?? '');
    setAssigned(booking.assignedCoordinatorId ?? ''); setNotes(booking.scheduleNotes ?? '');
  }, [booking.id, booking.updatedAt, booking.eventStartTime, booking.eventEndTime, booking.assignedCoordinatorId, booking.scheduleNotes]);
  const coordinatorName = (id: string) => staff.find(x => x.id === id)?.name ?? (id ? 'Previously assigned coordinator' : 'Unassigned');
  const changes: BookingChange[] = useMemo(() => {
    const result: BookingChange[] = [];
    if (start !== (booking.eventStartTime ?? '')) result.push({ label: 'Start time', before: booking.eventStartTime ?? 'Not set', after: start || 'Not set' });
    if (end !== (booking.eventEndTime ?? '')) result.push({ label: 'End time', before: booking.eventEndTime ?? 'Not set', after: end || 'Not set' });
    if (assigned !== (booking.assignedCoordinatorId ?? '')) result.push({ label: 'Assigned coordinator', before: coordinatorName(booking.assignedCoordinatorId ?? ''), after: coordinatorName(assigned) });
    if (notes.trim() !== (booking.scheduleNotes ?? '')) result.push({ label: 'Private run-sheet notes', before: booking.scheduleNotes || 'Not set', after: notes.trim() || 'Not set' });
    return result;
  // Staff display names change only when directory loads; changes are recomputed on render.
  }, [start, end, assigned, notes, booking, staff]);
  function preview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setSuccess('');
    if (!!start !== !!end || (start && end && start >= end)) {
      setError('Choose both times with the end later than the start (same day).'); return;
    }
    if (booking.status === 'CANCELLED') { setError('Cancelled bookings cannot be scheduled.'); return; }
    if (!changes.length) { setError('No schedule changes to save.'); return; }
    setConfirmOpen(true);
  }
  async function save() {
    if (busy || !confirmOpen) return;
    setBusy(true); setError('');
    try {
      await api(`/api/bookings/${booking.id}/schedule`, json('PATCH', {
        eventStartTime: start || null, eventEndTime: end || null,
        assignedCoordinatorId: assigned || null, scheduleNotes: notes.trim(),
        expectedUpdatedAt: booking.updatedAt,
      }));
      setConfirmOpen(false); setSuccess('Event schedule saved.');
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save schedule');
    } finally { setBusy(false); }
  }
  return <>
    <div className={s.form}>
      <div className={`${s.alert} mb-1`}><ShieldCheck size={18} className="mt-0.5 shrink-0"/><span>Run-sheet notes are private to staff. The event date stays unchanged and Held/Confirmed reservations remain exclusive.</span></div>
      {staffLoading && <InlineSkeleton rows={1} label="Loading coordinator directory" />}
      <form onSubmit={preview} className={s.form}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label htmlFor="ops-start-time">Event start time</label><input id="ops-start-time" className={s.input} type="time" value={start} onChange={e => setStart(e.target.value)} disabled={!canEdit || booking.status === 'CANCELLED' || busy}/></div>
          <div><label htmlFor="ops-end-time">Event end time</label><input id="ops-end-time" className={s.input} type="time" value={end} onChange={e => setEnd(e.target.value)} disabled={!canEdit || booking.status === 'CANCELLED' || busy}/></div>
        </div>
        <div><label htmlFor="ops-coordinator">Assigned event coordinator</label>
          <select id="ops-coordinator" className={s.input} value={assigned} onChange={e => setAssigned(e.target.value)} disabled={!canEdit || booking.status === 'CANCELLED' || busy || staffLoading}>
            <option value="">Unassigned</option>
            {assigned && !staff.some(member => member.id === assigned) && <option value={assigned}>Previously assigned (inactive)</option>}
            {staff.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
          </select>
        </div>
        <div><label htmlFor="ops-run-sheet">Internal run-sheet notes</label><textarea id="ops-run-sheet" className={s.input} rows={4} maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} disabled={!canEdit || booking.status === 'CANCELLED' || busy} placeholder="Venue access, arrival instructions, setup timeline and supplier coordination"/></div>
        {error && <div className={`${s.alert} ${s.alertDanger}`} role="alert"><AlertCircle size={17} className="shrink-0"/>{error}</div>}
        {success && <div className={`${s.alert} ${s.alertSuccess}`} role="status"><CheckCircle2 size={17} className="shrink-0"/>{success}</div>}
        {canEdit && <button className={s.actionLink} type="submit" disabled={busy || booking.status === 'CANCELLED'}><Clock3 size={17}/>{busy ? 'Saving…' : 'Review schedule changes'}</button>}
      </form>
    </div>
    <BookingChangeDialog open={confirmOpen} reference={booking.reference} changes={changes} busy={busy} error={error} onCancel={() => setConfirmOpen(false)} onConfirm={() => void save()}/>
  </>;
}
