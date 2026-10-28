'use client';
import { useMemo, useState } from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import { Panel, PageTitle, money, niceDate, Empty } from '@/components/ui/Blocks';

type Month = { month: string; amount: string; gross: string; reductions: string; count: number };
type Movement = {
  id: string; reference: string; eventType: string; eventDate: string; recordedAt: string;
  movementType: 'CONFIRMATION' | 'ADJUSTMENT' | 'REVERSAL'; amountDelta: string; valueAfter: string;
};
type Report = { monthly: Month[]; details: Movement[]; reportBasis: string };
const monthInManila = (stamp: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(new Date(stamp));
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`;
};
export default function Analytics({ canExport = true }: { canExport?: boolean }) {
  const { data, loading, error } = useLiveQuery(() => api<Report>('/api/analytics'), []);
  const [selected, setSelected] = useState('');
  const months = data?.monthly ?? [];
  const chosen = selected && months.some(m => m.month === selected) ? selected : months.at(-1)?.month ?? '';
  const current = months.find(m => m.month === chosen);
  const points = months.map(m => ({
    month: m.month, label: new Date(`${m.month}-01T12:00:00`).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }),
    value: Number(m.amount), count: m.count,
  }));
  const details = useMemo(() => data?.details.filter(d => monthInManila(d.recordedAt) === chosen) ?? [], [data, chosen]);
  return <main className="page-wrap page-space">
    <PageTitle title="Monthly Confirmed Value Analytics" subtitle="Auditable confirmation, price-adjustment and cancellation reporting" />
    <p className="hint" style={{ marginBottom: 25 }}>{data?.reportBasis ?? 'Confirmed booking commitments, not payments, revenue or profit.'}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && !data ? <DetailSkeleton label="Loading monthly confirmed-value analytics" /> : <>
      <div className="split-main">
        <Panel title="Net confirmed-value changes by month">
          {points.length ? <ResponsiveContainer width="100%" height={320}><BarChart data={points} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2eaf1" />
            <XAxis dataKey="label" tickLine={false} />
            <YAxis tickFormatter={(x: number) => '₱' + (x / 1000).toFixed(0) + 'k'} width={70} />
            <Tooltip formatter={value => money(Number(value))} />
            <Bar dataKey="value" fill="#0b4d98" radius={[7, 7, 0, 0]} maxBarSize={66} />
          </BarChart></ResponsiveContainer> : <Empty title="No confirmed-value movements" description="The first confirmed booking creates the first monthly value entry." />}
        </Panel>
        <Panel title="Report details">
          <div className="field"><label htmlFor="report-month">Reporting month (Philippine time)</label>
            <select id="report-month" value={chosen} onChange={e => setSelected(e.target.value)} disabled={!months.length}>
              {months.map(m => <option key={m.month} value={m.month}>{m.month}</option>)}
            </select></div>
          <div style={{ marginTop: 25 }}>
            <p className="hint">Net change in confirmed commitments</p>
            <p className="stat-value">{money(current?.amount)}</p>
            <p className="hint mt-3">{current?.count ?? 0} new confirmations</p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-[#f1f6fa] p-3"><p className="hint">Positive movements</p><strong>{money(current?.gross)}</strong></div>
              <div className="rounded-lg bg-[#f1f6fa] p-3"><p className="hint">Reductions / reversals</p><strong>{money(current?.reductions)}</strong></div>
            </div>
          </div>
          <p className="hint mt-5">Reductions are reported in the month they occurred, without altering earlier months. Existing bookings are imported as an opening baseline.</p>
          {canExport && <a href="/api/report.csv" className="btn" style={{ width: '100%', marginTop: 25 }}>Export value movements (CSV)</a>}
        </Panel>
      </div>
      <Panel title="Confirmed-value audit trail" className="mt-6">
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Reference</th><th>Event</th><th>Event date</th><th>Recorded</th><th>Movement</th><th>Change (PHP)</th></tr></thead>
          <tbody>{details.map(item => <tr key={item.id}>
            <td>{item.reference}</td><td>{item.eventType}</td><td>{niceDate(item.eventDate)}</td>
            <td>{new Date(item.recordedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
            <td>{item.movementType}</td><td><strong>{money(item.amountDelta)}</strong></td>
          </tr>)}</tbody></table></div>
        {details.length === 0 && <p className="hint">No recorded value movements for this month.</p>}
      </Panel>
    </>}
  </main>;
}
