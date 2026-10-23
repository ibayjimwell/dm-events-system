'use client';

import Link from 'next/link';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { Panel, Stat, Status, PageTitle, Empty, niceDate, money } from '@/components/ui/Blocks';

type Booking = {
  id: string;
  reference: string;
  clientName: string;
  eventType: string;
  eventDate: string;
  status: string;
};

type Summary = {
  counts: {
    all: number;
    confirmed: number;
    tentative: number;
    held: number;
    active: number;
    unread: number;
    monthlyValue: number;
  };
  recent: Booking[];
};

type Metric = { label: string; value: string | number; detail: string };

export default function Dashboard({ role }: { role: 'CLIENT' | 'COORDINATOR' | 'ADMIN' }) {
  const { data, loading, error } = useLiveQuery(() => api<Summary>('/api/summary'), []);
  const isClient = role === 'CLIENT';
  const isAdmin = role === 'ADMIN';

  const title = isClient
    ? 'My event dashboard'
    : isAdmin
      ? 'Administrator overview'
      : 'Coordinator dashboard';

  const metrics: Metric[] = isClient
    ? [
        { label: 'Active Requests', value: data?.counts.active ?? 0, detail: 'Requests awaiting or under review' },
        { label: 'Confirmed Bookings', value: data?.counts.confirmed ?? 0, detail: 'Confirmed dates and packages' },
        { label: 'Unread Messages', value: data?.counts.unread ?? 0, detail: 'Conversation with DM Events' },
      ]
    : isAdmin
      ? [
          { label: 'Total Requests', value: data?.counts.all ?? 0, detail: 'Recorded booking inquiries' },
          { label: 'Confirmed Bookings', value: data?.counts.confirmed ?? 0, detail: 'Approved dates and packages' },
          { label: 'Monthly Booking Value', value: money(data?.counts.monthlyValue), detail: 'Confirmed value; not income received' },
        ]
      : [
          { label: 'New Inquiries', value: data?.counts.tentative ?? 0, detail: 'Requires review' },
          { label: 'Tentative / Held', value: data?.counts.active ?? 0, detail: 'Pending confirmation' },
          { label: 'Confirmed Events', value: data?.counts.confirmed ?? 0, detail: 'Scheduled events' },
        ];

  const bookingHref = (booking: Booking) =>
    isClient
      ? `/client/bookings/${booking.id}`
      : isAdmin
        ? `/admin/bookings/${booking.id}`
        : `/coordinator/requests/${booking.id}`;

  const actions: { text: string; href: string }[] = isClient
    ? [
        { text: 'View my bookings', href: '/client/bookings' },
        { text: 'Send a message', href: '/client/messages' },
        { text: 'Request an event', href: '/client/book' },
      ]
    : isAdmin
      ? [
          { text: 'Monthly analytics', href: '/admin/analytics' },
          { text: 'Manage packages', href: '/admin/maintenance/packages' },
          { text: 'Website maintenance', href: '/admin/maintenance/content' },
          { text: 'User access', href: '/admin/maintenance/users' },
        ]
      : [
          { text: 'Review requests', href: '/coordinator/requests' },
          { text: 'Check the calendar', href: '/coordinator/calendar' },
          { text: 'Reply to messages', href: '/coordinator/messages' },
        ];

  return (
    <main className="page-wrap page-space min-w-0">
      <PageTitle title={title} />
      {error && <p className="error break-words">{error}</p>}

      <div className="my-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="min-w-0 [&_.stat]:h-full [&_.stat]:min-w-0 [&_.stat]:p-4 sm:[&_.stat]:p-5 [&_.stat-value]:break-words [&_.stat-value]:text-3xl sm:[&_.stat-value]:text-4xl"
          >
            <Stat label={metric.label} value={metric.value} detail={metric.detail} />
          </div>
        ))}
      </div>

      {loading && !data ? (
        <p className="loading">Loading dashboard…</p>
      ) : (
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(270px,1fr)] xl:gap-6">
          <Panel
            className="min-w-0 overflow-hidden"
            title={isClient ? 'My booking requests' : isAdmin ? 'Operations snapshot' : 'Recent client requests'}
          >
            {/* Mobile and tablet booking cards: no horizontal page overflow. */}
            <div className="space-y-3 xl:hidden">
              {data?.recent.map((booking) => (
                <article key={booking.id} className="min-w-0 rounded-lg border border-[#dae4ed] bg-[#f8fbfe] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link href={bookingHref(booking)} className="min-w-0 break-all font-semibold text-[#0b4d98] hover:underline">
                      {booking.reference}
                    </Link>
                    <Status value={booking.status} />
                  </div>
                  <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 min-[440px]:grid-cols-2">
                    {!isClient && (
                      <div className="min-w-0">
                        <dt className="text-xs text-[#748498]">Client</dt>
                        <dd className="mt-1 break-words font-medium">{booking.clientName}</dd>
                      </div>
                    )}
                    <div className="min-w-0">
                      <dt className="text-xs text-[#748498]">Event type</dt>
                      <dd className="mt-1 break-words font-medium">{booking.eventType}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-[#748498]">Preferred date</dt>
                      <dd className="mt-1 font-medium">{niceDate(booking.eventDate)}</dd>
                    </div>
                  </dl>
                  <Link href={bookingHref(booking)} className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-[#0b4d98] hover:underline">
                    View booking →
                  </Link>
                </article>
              ))}
            </div>

            {/* Original table remains available on wider desktop screens. */}
            <div className="hidden min-w-0 overflow-x-auto xl:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    {!isClient && <th>Client</th>}
                    <th>Event type</th>
                    <th>Preferred date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recent.map((booking) => (
                    <tr key={booking.id}>
                      <td>
                        <Link href={bookingHref(booking)}>{booking.reference}</Link>
                      </td>
                      {!isClient && <td className="break-words">{booking.clientName}</td>}
                      <td className="break-words">{booking.eventType}</td>
                      <td>{niceDate(booking.eventDate)}</td>
                      <td><Status value={booking.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data?.recent.length === 0 && (
              <Empty title="No bookings yet" description="New event requests will appear here." />
            )}
            <p className="hint mt-6">
              {isClient
                ? 'Track tentative, held, confirmed and cancelled dates without assuming confirmation.'
                : isAdmin
                  ? 'Confirmed booking values are not payments or profit.'
                  : 'Review inquiries, check dates, coordinate event details, and message clients.'}
            </p>
          </Panel>

          <Panel
            className="min-w-0 overflow-hidden"
            title={isClient ? 'Quick actions' : isAdmin ? 'Administrator access' : 'Coordinator actions'}
          >
            <nav aria-label={`${title} actions`} className="grid min-w-0 grid-cols-1 gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-1">
              {actions.map((action) => (
                <Link key={action.href} className="btn min-w-0 w-full text-center break-words" href={action.href}>
                  {action.text}
                </Link>
              ))}
            </nav>
          </Panel>
        </div>
      )}
    </main>
  );
}
