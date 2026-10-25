'use client';
import { useState } from 'react';
import { RefreshCw, Mail, MessageSquareText, RotateCcw } from 'lucide-react';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { PageTitle } from '@/components/ui/Blocks';

type Item = {
  id: string;
  reference: string;
  eventType: string;
  channel: string;
  recipient: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
  nextAttemptAt: string;
};

const pillStyle: Record<string, string> = {
  ACCEPTED: 'bg-emerald-50 text-emerald-700', PENDING: 'bg-blue-50 text-blue-700',
  PROCESSING: 'bg-blue-50 text-blue-700', RETRY: 'bg-amber-50 text-amber-700',
  FAILED: 'bg-rose-50 text-rose-700',
};
export default function NotificationsEditor() {
  const { data, loading, error, refresh } = useLiveQuery(
    () => api<{ notifications: Item[] }>('/api/notifications'), [],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  async function retry(id: string) {
    setBusyId(id); setNotice('');
    try {
      await api('/api/notifications', json('POST', { id }));
      await refresh();
      setNotice('Requeued for delivery. Run the notifications scheduler to process pending messages.');
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Retry failed.'); }
    finally { setBusyId(null); }
  }

  return (
    <main className="page-wrap page-space min-w-0">
      <PageTitle title="Booking notifications" subtitle="Monitor operational email and SMS delivery, and retry failed requests." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-[#748498]">Accepted means Gmail SMTP or httpSMS accepted the request; it does not guarantee delivery to the recipient.</p>
        <button type="button" onClick={() => void refresh()} className="btn btn-ghost" disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice mb-5" role="status">{notice}</p>}
      <section className="grid min-w-0 gap-3">
        {data?.notifications.map(item => (
          <article key={item.id} className="min-w-0 rounded-xl border border-[#dae4ed] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="rounded-lg bg-[#edf3fa] p-2 text-[#0b4d98]">
                  {item.channel === 'SMS' ? <MessageSquareText size={19} /> : <Mail size={19} />}
                </span>
                <div className="min-w-0">
                  <p className="break-words font-semibold text-[#122c44]">{item.reference} · {item.eventType.replaceAll('_', ' ')}</p>
                  <p className="mt-1 break-words text-xs text-[#748498]">{item.channel} → {item.recipient}</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pillStyle[item.status] ?? 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#748498]">
              <span>Attempts: {item.attempts}</span>
              <span>Created: {new Date(item.createdAt).toLocaleString('en-PH')}</span>
              {item.processedAt && <span>Accepted: {new Date(item.processedAt).toLocaleString('en-PH')}</span>}
            </div>
            {item.lastError && <p className="mt-3 break-words rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{item.lastError}</p>}
            {['FAILED', 'RETRY'].includes(item.status) && <button type="button" disabled={busyId === item.id}
              onClick={() => void retry(item.id)} className="btn btn-ghost mt-4 gap-2">
              <RotateCcw size={15} /> {busyId === item.id ? 'Requeuing…' : 'Retry notification'}
            </button>}
          </article>
        ))}
        {!loading && !data?.notifications.length && <div className="rounded-xl border border-[#dae4ed] bg-white p-8 text-center text-sm text-[#748498]">No booking notifications recorded yet.</div>}
      </section>
    </main>
  );
}
