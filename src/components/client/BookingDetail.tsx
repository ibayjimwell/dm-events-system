'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { api, json } from '@/api-client/http';
import { Panel, PageTitle, Status, niceDate, Field } from '@/components/ui/Blocks';

type Detail = {
  id: string;
  reference: string;
  eventType: string;
  eventDate: string;
  venue: string;
  status: string;
  guestCount: number;
  estimatedBudget: string;
  preferredTheme: string;
  colorPalette: string;
  specialRequests: string;
  inspirationAssetId: string | null;
  reviewNote: string | null;
  cancellationRequestedAt: string | null;
  cancellationReason: string | null;
  package: { name: string } | null;
  history: {
    id: string;
    toStatus: string;
    note: string | null;
    actorName: string;
    createdAt: string;
  }[];
};

type DetailRow = { label: string; value: string };

export default function BookingDetail({ id }: { id: string }) {
  const { data, error, loading, refresh } = useLiveQuery(
    () => api<{ booking: Detail }>(`/api/bookings/${id}`),
    [id],
  );

  const booking = data?.booking;
  const [cancelReason, setCancelReason] = useState('');
  const [edit, setEdit] = useState(false);
  const [theme, setTheme] = useState('');
  const [colors, setColors] = useState('');
  const [requests, setRequests] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const result = await api<{ message: string }>(
        `/api/bookings/${id}/cancel`,
        json('POST', { reason: cancelReason }),
      );

      setMessage(result.message);
      setCancelReason('');
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Cancellation request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      await api(
        `/api/bookings/${id}`,
        json('PATCH', {
          preferredTheme: theme,
          colorPalette: colors,
          specialRequests: requests,
        }),
      );

      setEdit(false);
      await refresh();
      setMessage('Preferences updated.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to update preferences.');
    } finally {
      setBusy(false);
    }
  }

  function togglePreferences() {
    if (!booking) return;
    setEdit((previous) => !previous);
    setTheme(booking.preferredTheme ?? '');
    setColors(booking.colorPalette ?? '');
    setRequests(booking.specialRequests ?? '');
  }

  const details: DetailRow[] = booking
    ? [
        { label: 'Requested date', value: niceDate(booking.eventDate) },
        { label: 'Venue', value: booking.venue },
        { label: 'Guests', value: String(booking.guestCount) },
        { label: 'Estimated budget', value: booking.estimatedBudget },
        { label: 'Preferred package', value: booking.package?.name || 'Not decided' },
        { label: 'Theme', value: booking.preferredTheme || 'Not set' },
        { label: 'Colors', value: booking.colorPalette || 'Not set' },
        { label: 'Special requests', value: booking.specialRequests || '—' },
      ]
    : [];

  return (
    <main className="page-wrap page-space min-w-0 [overflow-wrap:anywhere]">
      <div className="min-w-0 [&_h2]:break-words">
        <PageTitle
          title={booking ? `${booking.reference} • ${booking.eventType}` : 'Booking details'}
          subtitle="Track your request, preferences and status history."
        />
      </div>

      {error && <p className="error break-words" role="alert">{error}</p>}

      {loading && !booking ? (
        <p className="loading">Loading…</p>
      ) : (
        booking && (
          <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(290px,1fr)] xl:gap-6">
            {/* Event details and history: left column on desktop, full width on mobile. */}
            <div className="flex min-w-0 flex-col gap-5 xl:gap-6">
              <Panel title="Event information" className="min-w-0 overflow-hidden">
                <Status value={booking.status} />

                {/* Mobile/tablet: readable stacked rows instead of a wide table. */}
                <dl className="mt-5 divide-y divide-[#dae4ed] md:hidden">
                  {details.map(({ label, value }) => (
                    <div key={label} className="min-w-0 py-3 first:pt-0">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#748498]">
                        {label}
                      </dt>
                      <dd className="mt-1 min-w-0 break-words text-sm leading-relaxed text-[#122c44] [overflow-wrap:anywhere]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Desktop: preserve the original two-column detail table. */}
                <div className="mt-5 hidden min-w-0 overflow-x-auto md:block">
                  <table className="data-table">
                    <tbody>
                      {details.map(({ label, value }) => (
                        <tr key={label}>
                          <th scope="row" className="w-[38%] align-top">{label}</th>
                          <td className="min-w-0 break-words [overflow-wrap:anywhere]">
                            {value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {booking.inspirationAssetId && (
                  <div className="mt-5 min-w-0">
                    <h4 className="mb-3 font-semibold">Inspiration photo</h4>
                    {/* Private asset URLs are served by the authenticated API route. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/assets/${booking.inspirationAssetId}`}
                      alt="Submitted inspiration"
                      loading="lazy"
                      className="max-h-80 w-full max-w-full rounded-lg bg-[#f1f6fa] object-contain"
                    />
                  </div>
                )}

                {booking.reviewNote && (
                  <p className="notice mt-5 break-words [overflow-wrap:anywhere]">
                    {booking.reviewNote}
                  </p>
                )}
              </Panel>

              <Panel title="Booking status history" className="min-w-0 overflow-hidden">
                {booking.history.length === 0 ? (
                  <p className="hint">No status updates recorded yet.</p>
                ) : (
                  <div className="divide-y divide-[#dae4ed]">
                    {booking.history.map((entry) => (
                      <div key={entry.id} className="min-w-0 py-3 first:pt-0 last:pb-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Status value={entry.toStatus} />
                          <span className="hint min-w-0 break-words [overflow-wrap:anywhere]">
                            {entry.actorName} • {niceDate(entry.createdAt)}
                          </span>
                        </div>
                        {entry.note && (
                          <p className="mt-2 break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                            {entry.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* Action cards stack below the content on mobile. */}
            <div className="flex min-w-0 flex-col gap-5 xl:gap-6">
              <Panel title="Quick actions" className="min-w-0 overflow-hidden">
                <div className="grid min-w-0 gap-3">
                  <Link
                    href={`/client/messages?booking=${id}`}
                    className="btn w-full min-w-0 whitespace-normal px-3 text-center leading-5"
                  >
                    Message DM Events
                  </Link>

                  <Link
                    href="/client/bookings"
                    className="btn btn-ghost w-full min-w-0 whitespace-normal px-3 text-center leading-5"
                  >
                    All bookings
                  </Link>

                  {['TENTATIVE', 'HELD'].includes(booking.status) && (
                    <button
                      type="button"
                      className="btn btn-ghost w-full min-w-0 whitespace-normal px-3 text-center leading-5"
                      onClick={togglePreferences}
                      aria-expanded={edit}
                    >
                      {edit ? 'Close preferences' : 'Update preferences'}
                    </button>
                  )}
                </div>

                {edit && ['TENTATIVE', 'HELD'].includes(booking.status) && (
                  <form onSubmit={save} className="mt-5 grid min-w-0 gap-4">
                    <div className="min-w-0">
                      <Field label="Theme">
                        <input
                          className="w-full min-w-0 max-w-full"
                          value={theme}
                          onChange={(event) => setTheme(event.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="min-w-0">
                      <Field label="Colors">
                        <input
                          className="w-full min-w-0 max-w-full"
                          value={colors}
                          onChange={(event) => setColors(event.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="min-w-0">
                      <Field label="Requests">
                        <textarea
                          className="w-full min-w-0 max-w-full"
                          value={requests}
                          onChange={(event) => setRequests(event.target.value)}
                        />
                      </Field>
                    </div>
                    <button type="submit" className="btn w-full whitespace-normal text-center" disabled={busy}>
                      {busy ? 'Saving…' : 'Save preferences'}
                    </button>
                  </form>
                )}
              </Panel>

              <Panel title="Request cancellation" className="min-w-0 overflow-hidden">
                {booking.status === 'CANCELLED' ? (
                  <p className="hint">This booking is cancelled.</p>
                ) : booking.cancellationRequestedAt ? (
                  <p className="notice notice-warn break-words [overflow-wrap:anywhere]">
                    Cancellation requested. DM Events will review it. Your booking remains{' '}
                    {booking.status.toLowerCase()} until updated by authorized personnel.
                  </p>
                ) : (
                  <form onSubmit={cancel} className="min-w-0">
                    <p className="hint">
                      Cancellation is reviewed by DM Events and does not automatically change your booking status.
                    </p>
                    <div className="field my-4 min-w-0">
                      <label htmlFor="cancellation-reason">Reason</label>
                      <textarea
                        id="cancellation-reason"
                        required
                        minLength={3}
                        className="w-full min-w-0 max-w-full"
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder="Why are you requesting cancellation?"
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-danger w-full min-w-0 whitespace-normal px-3 text-center leading-5"
                      disabled={busy}
                    >
                      {busy ? 'Submitting…' : 'Submit cancellation request'}
                    </button>
                  </form>
                )}
              </Panel>

              {message && (
                <p className="notice break-words [overflow-wrap:anywhere]" role="status">
                  {message}
                </p>
              )}
            </div>
          </div>
        )
      )}
    </main>
  );
}
