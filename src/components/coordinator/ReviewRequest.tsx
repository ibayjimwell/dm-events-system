'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { Panel, PageTitle, Status, Field, niceDate } from '@/components/ui/Blocks';

type Detail = {
  id: string;
  reference: string;
  eventType: string;
  eventDate: string;
  venue: string;
  guestCount: number;
  estimatedBudget: string;
  preferredTheme: string;
  colorPalette: string;
  specialRequests: string;
  inspirationAssetId: string | null;
  status: 'TENTATIVE' | 'HELD' | 'CONFIRMED' | 'CANCELLED';
  bookedValue: string | null;
  reviewNote: string | null;
  cancellationRequestedAt: string | null;
  cancellationReason: string | null;
  client: { fullName: string; email: string; phone: string | null };
  package: { name: string } | null;
  history: {
    id: string;
    toStatus: string;
    note: string | null;
    actorName: string;
    createdAt: string;
  }[];
};

export default function ReviewRequest({
  id,
  role,
  canUpdateStatus = true,
  canMessage = true,
}: {
  id: string;
  role: 'COORDINATOR' | 'ADMIN';
  canUpdateStatus?: boolean;
  canMessage?: boolean;
}) {
  const { data, loading, error, refresh } = useLiveQuery(
    () => api<{ booking: Detail }>(`/api/bookings/${id}`),
    [id],
  );
  const booking = data?.booking;
  const [status, setStatus] = useState<Detail['status']>('TENTATIVE');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => {
    if (booking) {
      setStatus(booking.status);
      setValue(booking.bookedValue || '');
      setNote(booking.reviewNote || '');
    }
  }, [booking?.id, booking?.status, booking?.bookedValue, booking?.reviewNote]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult('');
    try {
      await api(
        `/api/bookings/${id}/status`,
        json('POST', {
          status,
          bookedValue: value === '' ? null : Number(value),
          note,
          overrideConflict: override,
        }),
      );
      await refresh();
      setOverride(false);
      setResult('Booking status and history saved. The client will see the new status.');
    } catch (caught) {
      setResult(caught instanceof Error ? caught.message : 'Unable to save status.');
    } finally {
      setBusy(false);
    }
  }

  const details: { label: string; value: string }[] = booking
    ? [
        { label: 'Client', value: booking.client.fullName },
        { label: 'Email', value: booking.client.email },
        { label: 'Contact', value: booking.client.phone || '—' },
        { label: 'Preferred date', value: niceDate(booking.eventDate) },
        { label: 'Venue', value: booking.venue },
        { label: 'Guest count', value: String(booking.guestCount) },
        { label: 'Budget', value: booking.estimatedBudget },
        { label: 'Preferred package', value: booking.package?.name || 'Not decided' },
        {
          label: 'Theme / colors',
          value: [booking.preferredTheme, booking.colorPalette].filter(Boolean).join(' • ') || '—',
        },
        { label: 'Additional requests', value: booking.specialRequests || '—' },
      ]
    : [];

  return (
    <main className="page-wrap page-space min-w-0">
      <PageTitle
        title="Review event request"
        subtitle={booking ? `${booking.reference} • ${booking.eventType}` : 'Loading event details'}
      />
      {error && <p className="error break-words">{error}</p>}
      {loading && !booking ? (
        <p className="loading">Loading request…</p>
      ) : (
        booking && (
          <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(290px,1fr)] xl:gap-6">
            <Panel
              title={`${booking.reference} • ${booking.eventType}`}
              className="min-w-0 overflow-hidden [&_h3]:break-words"
            >
              {/* Mobile/tablet: two-line details that fit even at 320 px. */}
              <dl className="divide-y divide-[#dae4ed] md:hidden">
                {details.map((item) => (
                  <div key={item.label} className="min-w-0 py-3 first:pt-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#748498]">
                      {item.label}
                    </dt>
                    <dd className="mt-1 min-w-0 break-words text-sm leading-relaxed text-[#122c44] [overflow-wrap:anywhere]">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Keep the original table layout for desktop. */}
              <div className="hidden min-w-0 overflow-x-auto md:block">
                <table className="data-table">
                  <tbody>
                    {details.map((item) => (
                      <tr key={item.label}>
                        <th className="w-[35%] align-top">{item.label}</th>
                        <td className="break-words [overflow-wrap:anywhere]">{item.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {booking.cancellationRequestedAt && (
                <p className="notice notice-warn mt-5 break-words [overflow-wrap:anywhere]">
                  Client requested cancellation: {booking.cancellationReason}. Review before marking cancelled.
                </p>
              )}

              <h3 className="mb-4 mt-7 text-xl">History</h3>
              <div className="divide-y divide-[#dae4ed]">
                {booking.history.map((entry) => (
                  <article key={entry.id} className="min-w-0 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                      <Status value={entry.toStatus} />
                      <span className="hint min-w-0 break-words [overflow-wrap:anywhere]">
                        {niceDate(entry.createdAt)} • {entry.actorName}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                      {entry.note || 'Status updated'}
                    </p>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel title="Review & coordinate" className="min-w-0 overflow-hidden">
              <p className="mb-3 break-words font-semibold">
                Inspiration photo {booking.inspirationAssetId ? 'attached' : 'not attached'}
              </p>
              {booking.inspirationAssetId ? (
                <a
                  href={`/api/assets/${booking.inspirationAssetId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block min-w-0"
                >
                  {/* Image is served by the application's authenticated asset endpoint. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${booking.inspirationAssetId}`}
                    alt="Client inspiration"
                    className="max-h-[260px] w-full max-w-full rounded-lg bg-[#f1f6fa] object-contain"
                  />
                  <span className="linklike mt-2 inline-block">View submitted image ↗</span>
                </a>
              ) : (
                <p className="hint">Client did not upload a photo.</p>
              )}

              {canUpdateStatus ? <form onSubmit={save} className="mt-7 grid min-w-0 gap-5">
                <div className="min-w-0 [&_.field]:min-w-0">
                  <Field label="Booking status">
                    <select
                      className="w-full min-w-0 max-w-full"
                      value={status}
                      onChange={(event) => setStatus(event.target.value as Detail['status'])}
                    >
                      <option value="TENTATIVE">Tentative</option>
                      <option value="HELD">Held</option>
                      <option value="CONFIRMED">Confirmed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </Field>
                </div>

                <div className="min-w-0">
                  <Field label="Agreed booking value (PHP)">
                    <input
                      className="w-full min-w-0 max-w-full"
                      type="number"
                      min="0"
                      step="0.01"
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      placeholder="Required to confirm"
                    />
                  </Field>
                </div>

                <div className="min-w-0">
                  <Field label="Coordinator notes / client update">
                    <textarea
                      className="w-full min-w-0 max-w-full"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Status update and next steps"
                    />
                  </Field>
                </div>

                <label className="flex min-w-0 cursor-pointer items-start gap-3 text-xs leading-relaxed text-[#122c44]">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(event) => setOverride(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-[#0b4d98]"
                  />
                  <span className="min-w-0">
                    I checked possible same-date conflicts and intentionally acknowledge any overlap.
                  </span>
                </label>

                <button type="submit" className="btn w-full" disabled={busy}>
                  {busy ? 'Saving…' : 'Save Status'}
                </button>
                {result && <p className="notice break-words [overflow-wrap:anywhere]" role="status">{result}</p>}
              </form> : <p className="notice mt-5">This account has review access but not permission to change booking status.</p>}

              {canMessage && <Link
                href={role === 'ADMIN' ? `/admin/messages?booking=${id}` : `/coordinator/messages?booking=${id}`}
                className="btn btn-ghost mt-4 w-full text-center"
              >
                Message client
              </Link>}
              <Link
                href={role === 'ADMIN' ? '/admin/bookings' : '/coordinator/calendar'}
                className="mt-4 block break-words font-semibold text-[#0b4d98] hover:underline"
              >
                {role === 'ADMIN' ? 'Back to all bookings →' : 'Check calendar & date availability →'}
              </Link>
              <p className="hint mt-5">
                No staff duty or task assignment. Dates are reviewed by DM Events.
              </p>
            </Panel>
          </div>
        )
      )}
    </main>
  );
}
