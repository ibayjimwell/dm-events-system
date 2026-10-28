
'use client';

import type { Permission } from '@/lib/permissions';
import Link from 'next/link';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { StatSkeleton, ListSkeleton } from '@/components/ui/LoadingSkeleton';
import { Panel, Stat, PageTitle, money } from '@/components/ui/Blocks';

type Summary = {
  counts: {
    all: number;
    confirmed: number;
    monthlyValue: number;
    unread: number;
  };
};

type Analytics = {
  monthly: { month: string; count: number; amount: string }[];
};

export default function Overview({permissions=[]}:{permissions?:Permission[]}) {
  const canAnalytics=permissions.includes('analytics.view');
  const summary = useLiveQuery(() => api<Summary>('/api/summary'), []);
  const analytics = useLiveQuery(() => canAnalytics ? api<Analytics>('/api/analytics') : Promise.resolve({monthly:[]}), [canAnalytics]);
  const counts = summary.data?.counts;
  const months = analytics.data?.monthly.slice(-5).reverse() ?? [];

  const metrics = [
    {
      label: 'Total requests',
      value: counts?.all ?? 0,
      detail: 'Recorded booking inquiries',
    },
    {
      label: 'Confirmed bookings',
      value: counts?.confirmed ?? 0,
      detail: 'Approved dates and packages',
    },
    {
      label: 'Monthly booking value',
      value: money(counts?.monthlyValue),
      detail: 'Value confirmed this month; not cash received',
    },
  ];

  return (
    <main className="page-wrap page-space min-w-0">
      <PageTitle title="Administrator overview" />
      {summary.error && <div className="error break-words">{summary.error}</div>}
      {analytics.error && <div className="error break-words">{analytics.error}</div>}

      {/* Do not use global .stats: this grid changes at every breakpoint. */}
      {summary.loading && !summary.data ? <StatSkeleton /> : <div className="my-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="min-w-0 [&_.stat]:h-full [&_.stat]:min-w-0 [&_.stat]:p-4 sm:[&_.stat]:p-5 [&_.stat-value]:break-words [&_.stat-value]:text-3xl sm:[&_.stat-value]:text-4xl"
          >
            <Stat label={metric.label} value={metric.value} detail={metric.detail} />
          </div>
        ))}
      </div>}

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(270px,1fr)] xl:gap-6">
        <Panel title="Operations snapshot" className="min-w-0 overflow-hidden">
          {/* Small screens: readable cards instead of a table wider than the viewport. */}
          <div className="space-y-3 md:hidden">{analytics.loading && !analytics.data && canAnalytics && <ListSkeleton rows={3} />}
            {months.map((month) => (
              <article key={month.month} className="min-w-0 rounded-lg border border-[#dae4ed] bg-[#f8fbfe] p-4">
                <h4 className="text-base font-semibold text-[#122c44]">
                  {new Date(`${month.month}-01T12:00:00`).toLocaleDateString('en-PH', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </h4>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-[#748498]">Confirmed bookings</dt>
                    <dd className="mt-1 font-semibold text-[#122c44]">{month.count}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-[#748498]">Booked value</dt>
                    <dd className="mt-1 break-words font-semibold text-[#0b4d98]">{money(month.amount)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* Larger screens: retain the PDF's tabular desktop presentation. */}
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Confirmed bookings</th>
                  <th>Booked value</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month}>
                    <td>
                      {new Date(`${month.month}-01T12:00:00`).toLocaleDateString('en-PH', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </td>
                    <td>{month.count}</td>
                    <td>{money(month.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!months.length && (
            <p className="hint py-4">Confirmed booking summaries will appear here after coordinator approval.</p>
          )}
          <p className="hint mt-6">
            Movements are dated in Philippine time and include later adjustments. These figures are not received income,
            revenue or profit.
          </p>
        </Panel>

        <Panel title="Authorized modules" className="min-w-0 overflow-hidden">
          <ul className="mt-1 space-y-4 break-words text-sm leading-relaxed sm:mt-4">
            {[
              {p:'analytics.view',label:'Monthly booking-value analytics',href:'/admin/analytics'},
              {p:'content.manage',label:'Website content',href:'/admin/maintenance/content'},
              {p:'bookings.view.all',label:'Booking oversight',href:'/admin/bookings'},
              {p:'packages.manage',label:'Package management',href:'/admin/maintenance/packages'},
              {p:'backups.manage',label:'Encrypted backups',href:'/admin/maintenance/backups'},
              {p:'users.manage',label:'Accounts and permission management',href:'/admin/maintenance/users'},
              {p:'bookings.create.walkin',label:'Walk-in bookings',href:'/admin/walk-in'},
            ].filter(item=>permissions.includes(item.p as Permission)).map(item=><li key={item.p} className="flex min-w-0 items-start gap-3"><span className="shrink-0 text-[#2d967c]">✓</span><Link className="min-w-0 text-[#0b4d98] hover:underline" href={item.href}>{item.label}</Link></li>)}
          </ul>
          {!permissions.includes('analytics.view')&&<p className="hint mt-5">Financial reporting requires the separate Analytics permission.</p>}
        </Panel>
      </div>
    </main>
  );
}
