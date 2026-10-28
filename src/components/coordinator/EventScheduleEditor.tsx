'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, json } from '@/api-client/http';
import { InlineSkeleton } from '@/components/ui/LoadingSkeleton';
import BookingChangeDialog, { type BookingChange } from '@/components/ui/BookingChangeDialog';

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
    <section className="mt-6 rounded-xl border border-[#dae4ed] bg-white p-4 sm:p-5">
      <h3 className="mb-2 text-lg font-semibold">Event operations schedule</h3>
      <p className="hint mb-5">Run-sheet details are internal. The preferred date stays unchanged; Held/Confirmed dates remain exclusive.</p>
      {staffLoading && <InlineSkeleton rows={1} label="Loading coordinator directory" />}
      <form onSubmit={preview} className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field">Event start time<input type="time" value={start} onChange={e => setStart(e.target.value)} disabled={!canEdit || booking.status === 'CANCELLED' || busy} /></label>
          <label className="field">Event end time<input type="time" value={end} onChange={e => setEnd(e.target.value)} disabled={!canEdit || booking.status === 'CANCELLED' || busy} /></label>
        </div>
        <label className="field">Assigned event coordinator
          <select value={assigned} onChange={e => setAssigned(e.target.value)} disabled={!canEdit || booking.status === 'CANCELLED' || busy || staffLoading}>
            <option value="">Unassigned</option>
            {assigned && !staff.some(s => s.id === assigned) && <option value={assigned}>Previously assigned (inactive)</option>}
            {staff.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
          </select>
        </label>
        <label className="field">Internal run-sheet notes<textarea rows={4} maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} disabled={!canEdit || booking.status === 'CANCELLED' || busy} placeholder="Venue access, arrival instructions, supplier timings, setup and teardown notes…" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        {success && <p className="notice" role="status">{success}</p>}
        {canEdit && <button className="btn" type="submit" disabled={busy || booking.status === 'CANCELLED'}>{busy ? 'Saving…' : 'Review schedule changes'}</button>}
      </form>
    </section>
    <BookingChangeDialog open={confirmOpen} reference={booking.reference} changes={changes} busy={busy} error={error} onCancel={() => setConfirmOpen(false)} onConfirm={() => void save()} />
  </>;
}
