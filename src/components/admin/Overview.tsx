'use client';

import Link from 'next/link';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
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

export default function Overview() {
  const summary = useLiveQuery(() => api<Summary>('/api/summary'), []);
  const analytics = useLiveQuery(() => api<Analytics>('/api/analytics'), []);
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

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(270px,1fr)] xl:gap-6">
        <Panel title="Operations snapshot" className="min-w-0 overflow-hidden">
          {/* Small screens: readable cards instead of a table wider than the viewport. */}
          <div className="space-y-3 md:hidden">
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
            Reporting is based on confirmation month. These figures are not received income,
            revenue or profit.
          </p>
        </Panel>

        <Panel title="Administrator access" className="min-w-0 overflow-hidden">
          <ul className="mt-1 space-y-4 break-words text-sm leading-relaxed sm:mt-4">
            <li className="flex min-w-0 items-start gap-3">
              <span className="shrink-0 text-[#2d967c]" aria-hidden="true">✓</span>
              <Link className="min-w-0 text-[#0b4d98] underline-offset-4 hover:underline" href="/admin/analytics">
                Monthly booking-value analytics
              </Link>
            </li>
            {[
              'Website content maintenance',
              'Booking and account oversight',
              'Package information management',
              'Encrypted backup operations',
            ].map((item) => (
              <li key={item} className="flex min-w-0 items-start gap-3">
                <span className="shrink-0 text-[#2d967c]" aria-hidden="true">✓</span>
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </main>
  );
}
