'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CalendarClock, CheckCircle2, DatabaseBackup, Download,
  Eye, FileArchive, HardDrive, LockKeyhole, PlusCircle, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';

type BackupFrequency = 'daily' | 'weekly' | 'monthly';

type BackupEntry = {
  path: string; filename: string; kind: 'automatic' | 'manual'; createdAt: string; bytes: number;
};
type BackupStatus = {
  mode: 'managed-backups-v1'; ready: boolean; storage: boolean; encrypted: boolean; scheduled: boolean;
  schedule: { frequency: BackupFrequency; updatedAt: string | null };
  nextRunAt: string; automaticOverdue: boolean; missing: string[];
  retention: string; historyLimitPerKind: number;
  backups: BackupEntry[]; includes: string;
};
type InspectResult = {
  verified: boolean; filename: string; exportedAt: string; tables: number; rows: number;
  tableNames: string[]; format: string; message: string;
};

function formatDate(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unknown date';
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
  });
}
function formatBytes(value: number) {
  return `${Math.max(0, value / 1024).toFixed(1)} KB`;
}
function parseFailure(response: Response, body: unknown) {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return `Backup request failed (${response.status}).`;
}

export default function Backups({ canSettings = false }: { canSettings?: boolean }) {
  const { data, error, refresh, loading } = useLiveQuery(
    async () => {
      const status = await api<BackupStatus>('/api/backups');
      if (status.mode !== 'managed-backups-v1') {
        throw new Error('The server is not using the managed backup API. Check the deployed commit and API route.');
      }
      return status;
    }, [],
    { cacheKey: 'admin:/api/backups:managed-v2', realtimeKinds: [] },
  );
  const [busy, setBusy] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const [inspected, setInspected] = useState<InspectResult | null>(null);
  const [frequencyChoice, setFrequencyChoice] = useState<BackupFrequency | ''>('');

  const latestAuto = useMemo(() => data?.backups.find(item => item.kind === 'automatic'), [data]);
  const selectedFrequency = frequencyChoice || data?.schedule.frequency || 'daily';
  const hasFrequencyChange = Boolean(data?.ready && selectedFrequency !== data.schedule.frequency);
  const scheduleText = data?.schedule.frequency === 'weekly' ? 'Weekly · Monday'
    : data?.schedule.frequency === 'monthly' ? 'Monthly · 1st day' : 'Daily';

  async function request(url: string, method = 'GET', payload?: unknown) {
    const response = await fetch(url, {
      method, credentials: 'same-origin', cache: 'no-store',
      ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(parseFailure(response, body));
    return body;
  }

  async function run(action: () => Promise<void>, path: string | null = null) {
    if (busy) return;
    setBusy(true); setActivePath(path); setNotice(''); setFailed(false);
    try { await action(); }
    catch (cause) {
      setFailed(true);
      setNotice(cause instanceof Error ? cause.message : 'Backup operation failed.');
    } finally { setBusy(false); setActivePath(null); }
  }

  function createBackup() {
    if (!data?.ready) return;
    if (!window.confirm('Create an encrypted database backup in private Supabase Storage? This contains sensitive account and client data.')) return;
    void run(async () => {
      await request('/api/backups', 'POST');
      await refresh();
      setNotice('Backup saved successfully. It is now available in Backup History.');
    });
  }

  function saveSchedule() {
    if (!data?.ready || !hasFrequencyChange) return;
    void run(async () => {
      await request('/api/backups', 'PATCH', { frequency: selectedFrequency });
      setFrequencyChoice('');
      await refresh();
      setNotice(`Automatic backup frequency saved: ${selectedFrequency}. No redeployment needed.`);
    });
  }

  function inspectBackup(entry: BackupEntry) {
    void run(async () => {
      const body = await request(`/api/backups/file?path=${encodeURIComponent(entry.path)}&action=inspect`);
      const inspected = body as InspectResult;
      if (!inspected.verified) throw new Error('The backup could not be verified.');
      setInspected(inspected);
      setNotice('Backup checksum verified. The preview contains metadata only.');
    }, entry.path);
  }

  function downloadBackup(entry: BackupEntry) {
    void run(async () => {
      const response = await fetch(`/api/backups/file?path=${encodeURIComponent(entry.path)}`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
      });
      if (!response.ok) {
        const json: unknown = await response.json().catch(() => null);
        throw new Error(parseFailure(response, json));
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('The server returned an empty backup archive.');
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = entry.filename;
      document.body.appendChild(link);
      link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      setNotice('Download prepared. Check your device Downloads folder and store a secure offline copy.');
    }, entry.path);
  }

  function deleteBackup(entry: BackupEntry) {
    if (!window.confirm(`Permanently delete this saved backup?\n\n${entry.filename}\n\nThis cannot be undone.`)) return;
    void run(async () => {
      await request(`/api/backups/file?path=${encodeURIComponent(entry.path)}`, 'DELETE');
      if (inspected?.filename === entry.filename) setInspected(null);
      await refresh();
      setNotice('The selected backup has been deleted from private storage.');
    }, entry.path);
  }

  return <main className="page-wrap page-space workspace" data-dm-backup-center="managed-backups-v1">
    <section className="workspace-hero">
      <div className="workspace-hero__top"><div>
        <span className="workspace-kicker"><HardDrive size={15} /> VERCEL + SUPABASE STORAGE · NO EXTRA BACKUP SUBSCRIPTION</span>
        <h1>Backup Center</h1>
        <p>Choose daily, weekly or monthly automatic backups. Manage encrypted snapshots, history, verification and downloads.</p>
      </div>
        <div className="workspace-hero__actions"><button type="button" className="btn btn-outline" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh history</button></div>
      </div>
    </section>

    {error && <div className="workspace-banner workspace-banner--error workspace-section" role="alert">
      <AlertTriangle size={18} className="shrink-0" /><span>Unable to load backup history: {error}. Verify the deployment contains <code>app/api/backups/route.ts</code>, and that its folder is not ignored by Git.</span>
    </div>}

    <section className="workspace-section grid gap-4 md:grid-cols-3">
      <div className="workspace-card"><div className="flex items-center gap-2 text-[#123a59]"><ShieldCheck size={18}/><strong>Backup storage</strong></div>
        <p className="mt-3 text-xl font-extrabold text-[#153c59]">{data?.storage ? 'Configured' : 'Not configured'}</p>
        <p className="workspace-muted mt-2">Private Supabase Storage bucket, encrypted with AES-256-GCM.</p>
      </div>
      <div className="workspace-card"><div className="flex items-center gap-2 text-[#123a59]"><CalendarClock size={18}/><strong>Automatic schedule</strong></div>
        <p className="mt-3 text-xl font-extrabold text-[#153c59]">{data?.scheduled ? scheduleText : 'Cron not configured'}</p>
        <p className="workspace-muted mt-2">Around 2:00 AM Asia/Manila. Next: {data?.scheduled && data.ready ? formatDate(data.nextRunAt) : 'Not available'}</p>
      </div>
      <div className="workspace-card"><div className="flex items-center gap-2 text-[#123a59]"><FileArchive size={18}/><strong>Saved backups</strong></div>
        <p className="mt-3 text-xl font-extrabold text-[#153c59]">{data?.backups.length ?? '—'}</p>
        <p className="workspace-muted mt-2">{latestAuto ? `Last automatic: ${formatDate(latestAuto.createdAt)}` : 'No automatic snapshot recorded yet.'}</p>
      </div>
    </section>

    {data && !data.ready && <div role="alert" className="workspace-banner workspace-banner--warning workspace-section"><AlertTriangle size={18} className="shrink-0" /> <span>Backup storage is not ready. Missing or invalid server settings: <strong>{data.missing.join(', ') || 'check server configuration'}</strong>. Configure these in Vercel Production and redeploy. Local <code>.env</code> values are not automatically uploaded.</span></div>}
    {data && !data.scheduled && <div role="alert" className="workspace-banner workspace-banner--warning workspace-section"><AlertTriangle size={18} className="shrink-0" /> <span>Automatic backups require a valid <code>CRON_SECRET</code> in Vercel Production and the single daily cron in <code>vercel.json</code>. The selected frequency is checked by the server. Manual backups remain available.</span></div>}
    {data?.automaticOverdue && <div role="alert" className="workspace-banner workspace-banner--warning workspace-section"><AlertTriangle size={18} className="shrink-0" /> <span>The most recent scheduled {data.schedule.frequency} backup has not completed successfully. Check Vercel → Cron Jobs and function logs.</span></div>}

    <section className="workspace-section workspace-card" aria-labelledby="backup-frequency-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[240px] flex-1">
          <h2 id="backup-frequency-heading" className="text-lg font-extrabold text-[#153c59]">Automatic backup frequency</h2>
          <p className="workspace-muted mt-2">Select when your database should be backed up automatically (Philippine time).</p>
          <label htmlFor="backup-frequency" className="mt-4 block text-sm font-bold text-[#153c59]">Backup schedule</label>
          <select
            id="backup-frequency"
            className="mt-2 w-full max-w-sm rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            value={selectedFrequency}
            onChange={event => setFrequencyChoice(event.target.value as BackupFrequency)}
            disabled={!data?.ready || busy}
          >
            <option value="daily">Daily — every day</option>
            <option value="weekly">Weekly — every Monday</option>
            <option value="monthly">Monthly — every 1st day</option>
          </select>
          <p className="workspace-muted mt-2">All runs are around 2:00 AM Asia/Manila. Vercel invokes one daily check; the server skips days outside your chosen frequency.</p>
        </div>
        <button type="button" className="btn" disabled={busy || !hasFrequencyChange} onClick={saveSchedule}>
          <CalendarClock size={17} /> {busy && !activePath ? 'Saving…' : 'Save schedule'}
        </button>
      </div>
      {data?.ready && data.scheduled && <p className="workspace-muted mt-3">Next scheduled backup: <strong>{formatDate(data.nextRunAt)}</strong>. Changing frequency does not delete previous snapshots.</p>}
      {!data?.ready && <p className="workspace-muted mt-3">Schedule selection becomes available after the required backup environment variables are configured.</p>}
    </section>

    <section className="workspace-section workspace-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-lg font-extrabold text-[#153c59]">Create a backup now</h2>
          <p className="workspace-muted mt-2">Saves an encrypted copy in private storage; it can be inspected or downloaded from the list below.</p></div>
        <button type="button" className="btn" disabled={busy || !data?.ready} onClick={createBackup}><PlusCircle size={18} />{busy && !activePath ? 'Creating backup…' : 'Create backup'}</button>
      </div>
      {notice && <div role={failed ? 'alert' : 'status'} className={`workspace-banner mt-4 ${failed ? 'workspace-banner--error' : 'workspace-banner--success'}`}>
        {failed ? <AlertTriangle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}{notice}
      </div>}
    </section>

    <section className="workspace-section workspace-card">
      <div className="workspace-section__heading"><div><h2>Backup history</h2><p>Most recent 100 automatic and 100 manual entries; automatic snapshots retain the newest seven.</p></div></div>
      {loading && !data && <DetailSkeleton label="Loading backup history" />}
      {data && data.backups.length === 0 && <p className="workspace-muted py-6">No backups saved yet. Create your first backup or let your selected schedule run.</p>}
      {data && data.backups.length > 0 && <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-3 pr-4">Created</th><th className="py-3 pr-4">Type</th><th className="py-3 pr-4">Archive</th><th className="py-3 pr-4">Size</th><th className="py-3">Actions</th></tr></thead>
          <tbody>{data.backups.map(entry => <tr key={entry.path} className="border-b border-slate-100 align-middle">
            <td className="whitespace-nowrap py-3 pr-4">{formatDate(entry.createdAt)}</td>
            <td className="py-3 pr-4"><span className="workspace-pill">{entry.kind === 'automatic' ? 'Automatic' : 'Manual'}</span></td>
            <td className="max-w-[250px] break-all py-3 pr-4 text-xs">{entry.filename}</td>
            <td className="whitespace-nowrap py-3 pr-4">{formatBytes(entry.bytes)}</td>
            <td className="py-3"><div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-outline !px-3 !py-2" disabled={busy} onClick={() => inspectBackup(entry)} title="Verify and view backup metadata"><Eye size={15}/>{activePath === entry.path && busy ? 'Checking…' : 'View'}</button>
              <button type="button" className="btn btn-outline !px-3 !py-2" disabled={busy} onClick={() => downloadBackup(entry)}><Download size={15}/>Download</button>
              <button type="button" className="btn btn-outline !px-3 !py-2 !text-red-700" disabled={busy} onClick={() => deleteBackup(entry)}><Trash2 size={15}/>Delete</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {inspected && <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="flex items-center gap-2"><CheckCircle2 size={18}/> Verified backup details</strong><button type="button" className="font-bold underline" onClick={() => setInspected(null)}>Close</button></div>
        <p className="mt-3 break-all">{inspected.filename}</p>
        <p className="mt-1">Exported: {formatDate(inspected.exportedAt)} · {inspected.tables} tables · {inspected.rows} rows</p>
        <p className="mt-1">Tables: {inspected.tableNames.join(', ')}</p>
        <p className="mt-2 text-xs">{inspected.message} This is not a database restore or an independent recovery test.</p>
      </div>}
    </section>

    <section className="workspace-grid workspace-section">
      <div className="workspace-card"><div className="flex items-center gap-2 text-[#143d5e]"><LockKeyhole size={19}/><h2>Data protection</h2></div>
        <p className="workspace-muted mt-3">Backups are encrypted before upload and stored in a private Supabase Storage bucket. Only accounts with <code>backups.manage</code> can view and manage them.</p>
        <p className="workspace-muted mt-3">Snapshots include PostgreSQL public-table data, but exclude SQL schema definitions, Cloudinary images, Supabase Auth/Storage assets and environment secrets.</p>
        <p className="workspace-muted mt-3">Keep <code>BACKUP_ENCRYPTION_KEY</code> securely. If you lose or rotate it, older backups cannot be decrypted.</p>
      </div>
      <aside className="workspace-stack"><div className="workspace-card"><h2 className="font-bold text-[#143d5e]">Recovery</h2>
        <p className="workspace-muted mt-3">For an actual disaster recovery copy, periodically download an archive to a separate, encrypted device. Backups stored in the same Supabase project are not independent of project-level failure.</p>
        <p className="workspace-muted mt-3">Use the existing local restore script with a separate, empty test database. Production restore is not offered from the website.</p>
        {canSettings && <Link href="/admin/maintenance/settings?tab=policy" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0b4d98] hover:underline"><ShieldCheck size={16}/>Backup policy instructions</Link>}
      </div></aside>
    </section>
  </main>;
}
