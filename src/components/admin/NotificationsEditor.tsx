'use client';

import { useState } from 'react';
import { RefreshCw, Mail, MessageSquareText, RotateCcw, Send, Play } from 'lucide-react';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';
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

type DispatchResult = {
  claimed: number;
  accepted: number;
  retried: number;
  failed: number;
};

const pillStyle: Record<string, string> = {
  ACCEPTED: 'bg-emerald-50 text-emerald-700',
  PENDING: 'bg-blue-50 text-blue-700',
  PROCESSING: 'bg-blue-50 text-blue-700',
  RETRY: 'bg-amber-50 text-amber-700',
  FAILED: 'bg-rose-50 text-rose-700',
};

export default function NotificationsEditor() {
  const { data, loading, error, refresh } = useLiveQuery(
    () => api<{ notifications: Item[] }>('/api/notifications'), [],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);

  async function retry(id: string) {
    setBusyId(id);
    setNotice('');
    setNoticeError(false);
    try {
      await api('/api/notifications', json('POST', { id }));
      await refresh();
      setNotice('Notification requeued. Click Process pending now to deliver it.');
    } catch (error) {
      setNoticeError(true);
      setNotice(error instanceof Error ? error.message : 'Retry failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function processNow() {
    setDispatching(true);
    setNotice('');
    setNoticeError(false);
    try {
      const result = await api<DispatchResult>('/api/notifications/dispatch', json('POST', {}));
      setNotice(
        result.claimed
          ? `Processed ${result.claimed} queued notification(s): ${result.accepted} accepted, ${result.retried} scheduled for retry, ${result.failed} failed. Check the rows below.`
          : 'No notification is ready to deliver. Retry jobs with a future attempt time will remain queued until due.',
      );
      await refresh();
    } catch (error) {
      setNoticeError(true);
      setNotice(error instanceof Error ? error.message : 'Could not process pending notifications.');
    } finally {
      setDispatching(false);
    }
  }

  async function testEmail() {
    setTesting(true);
    setNotice('');
    setNoticeError(false);
    try {
      const result = await api<{ accepted: boolean; message: string }>(
        '/api/notifications/test-email', json('POST', {}),
      );
      setNotice(result.message);
    } catch (error) {
      setNoticeError(true);
      setNotice(error instanceof Error ? error.message : 'Email gateway test failed.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="page-wrap page-space min-w-0">
      <PageTitle
        title="Booking notifications"
        subtitle="Test the email connection, deliver pending messages, and monitor transactional email and SMS."
      />

      <section className="mb-5 rounded-xl border border-[#dae4ed] bg-white p-4 shadow-sm sm:p-5">
        <h2 className="!m-0 !font-sans !text-base !font-semibold !leading-6 text-[#122c44]">
          Delivery tools
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#748498]">
          The test sends a real email to your signed-in account address only. Processing sends at most two
          already-queued booking notifications per click. These actions do not change booking statuses.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={() => void testEmail()} disabled={testing || dispatching}
            className="btn flex w-full items-center gap-2 sm:w-auto">
            <Send size={16} aria-hidden="true" /> {testing ? 'Testing email…' : 'Send test email to myself'}
          </button>
          <button type="button" onClick={() => void processNow()} disabled={testing || dispatching}
            className="btn btn-ghost flex w-full items-center gap-2 sm:w-auto">
            <Play size={16} aria-hidden="true" /> {dispatching ? 'Processing…' : 'Process pending now'}
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading}
            className="btn btn-ghost flex w-full items-center gap-2 sm:w-auto">
            <RefreshCw size={16} aria-hidden="true" /> Refresh
          </button>
        </div>
        {notice && (
          <p role={noticeError ? 'alert' : 'status'}
            className={`mt-4 break-words rounded-lg p-3 text-sm ${noticeError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {notice}
          </p>
        )}
      </section>

      <p className="mb-5 text-sm leading-6 text-[#748498]">
        ACCEPTED means the provider accepted a message. It does not prove inbox or phone delivery.
        RETRY jobs are sent when their next scheduled attempt becomes due.
      </p>
      {error && <p className="error break-words" role="alert">{error}</p>}

      <section className="grid min-w-0 gap-3">
        {loading && !data && <ListSkeleton label="Loading notifications" rows={5} />}
        {data?.notifications.map((item) => (
          <article key={item.id} className="min-w-0 rounded-xl border border-[#dae4ed] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="rounded-lg bg-[#edf3fa] p-2 text-[#0b4d98]">
                  {item.channel === 'SMS' ? <MessageSquareText size={19} /> : <Mail size={19} />}
                </span>
                <div className="min-w-0">
                  <p className="break-words font-semibold text-[#122c44]">
                    {item.reference} · {item.eventType.replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1 break-words text-xs text-[#748498]">{item.channel} → {item.recipient}</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pillStyle[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {item.status}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#748498]">
              <span>Attempts: {item.attempts}</span>
              <span>Created: {new Date(item.createdAt).toLocaleString('en-PH')}</span>
              {item.processedAt && <span>Accepted: {new Date(item.processedAt).toLocaleString('en-PH')}</span>}
              {item.status === 'RETRY' && (
                <span>Next retry: {new Date(item.nextAttemptAt).toLocaleString('en-PH')}</span>
              )}
            </div>
            {item.lastError && (
              <p className="mt-3 break-words rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
                {item.lastError}
              </p>
            )}
            {['FAILED', 'RETRY'].includes(item.status) && (
              <button type="button" disabled={busyId === item.id}
                onClick={() => void retry(item.id)} className="btn btn-ghost mt-4 gap-2">
                <RotateCcw size={15} /> {busyId === item.id ? 'Requeuing…' : 'Retry notification'}
              </button>
            )}
          </article>
        ))}
        {!loading && !data?.notifications.length && (
          <div className="rounded-xl border border-[#dae4ed] bg-white p-8 text-center text-sm text-[#748498]">
            No booking notifications recorded yet. Create a booking or change its status to generate an outbox event.
          </div>
        )}
      </section>
    </main>
  );
}
