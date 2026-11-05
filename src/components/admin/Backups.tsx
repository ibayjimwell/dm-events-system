'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Clock3, CloudDownload,
  Database, DatabaseBackup, Download, FileArchive, HardDrive, History,
  LockKeyhole, RefreshCw, ShieldCheck, Trash2, XCircle,
} from 'lucide-react';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';

type Archive = {
  id: string;
  source: 'MANUAL' | 'SCHEDULED';
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  completedAt: string | null;
  filename: string | null;
  sizeBytes: number | null;
  tableCount: number | null;
  rowCount: number | null;
  tableRows: { name: string; rows: number }[] | null;
  error: string | null;
};
type Frequency = 'OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
type BackupResponse = {
  configured: boolean;
  setupIssues?: Array<'SUPABASE_URL' | 'SUPABASE_SERVER_KEY' | 'BACKUP_ARCHIVE_KEY'>;
  archiveKeyStatus?: 'READY' | 'MISSING' | 'TRAILING_BACKSLASH' | 'INVALID';
  schedulerConfigured: boolean;
  history: Archive[];
  schedule: { frequency: Frequency; nextRunAt: string | null; lastAttemptAt: string | null };
};

function dateLabel(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
  }).format(new Date(value));
}
function sizeLabel(value: number | null | undefined) {
  if (value == null) return '—';
  return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`;
}
function statusClass(status: Archive['status']) {
  return status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-800' :
    status === 'FAILED' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800';
}

export default function Backups({ canSettings = false }: { canSettings?: boolean }) {
  const { data, error, refresh, loading } = useLiveQuery(
    () => api<BackupResponse>('/api/backups'), [],
    { cacheKey: 'admin:/api/backups', realtimeKinds: [] },
  );
  const [busy, setBusy] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const [frequencyDraft, setFrequencyDraft] = useState<Frequency | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'MANUAL' | 'SCHEDULED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useMemo(() => data?.history ?? [], [data?.history]);
  const successes = useMemo(() => history.filter(a => a.status === 'SUCCESS'), [history]);
  const currentFrequency = data?.schedule.frequency ?? 'OFF';
  const frequency = frequencyDraft ?? currentFrequency;
  const filtered = history.filter(h => filter === 'ALL' || h.source === filter);
  const selected = selectedId ? history.find(x => x.id === selectedId) : undefined;
  const chart = [...successes].slice(0, 8).reverse();
  const maxSize = Math.max(1, ...chart.map(c => c.sizeBytes ?? 0));
  const latest = successes[0];
  const canCreate = Boolean(data?.configured);

  function flash(message: string, isError = false) { setNotice(message); setFailed(isError); }

  async function create() {
    if (!canCreate || busy) return;
    if (!window.confirm('Create a new database backup?')) return;
    setBusy(true); flash('');
    try {
      await api('/api/backups', { method: 'POST' });
      flash('Backup completed and added to your history.');
      await refresh();
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : 'The backup could not be created.', true);
      await refresh();
    } finally { setBusy(false); }
  }

  async function saveFrequency() {
    if (savingSchedule || frequency === currentFrequency) return;
    setSavingSchedule(true); flash('');
    try {
      await api('/api/backups/schedule', json('PATCH', { frequency }));
      flash(frequency === 'OFF' ? 'Automatic backups have been turned off.' : 'Backup schedule saved.');
      await refresh(); setFrequencyDraft(null);
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : 'Unable to save the schedule.', true);
    } finally { setSavingSchedule(false); }
  }

  async function download(archive: Archive) {
    if (archive.status !== 'SUCCESS' || downloadingId) return;
    setDownloadingId(archive.id); flash('');
    try {
      const response = await fetch(`/api/backups/${archive.id}/download`, {
        credentials: 'same-origin', cache: 'no-store',
      });
      if (!response.ok) {
        let reason = `Download failed (${response.status}).`;
        try { const body: { error?: string } = await response.json(); if (body.error) reason = body.error; } catch { /* Non-JSON response */ }
        throw new Error(reason);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('The backup archive was empty.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = archive.filename ?? 'DM-Events-Backup.json.gz';
      a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      flash('Download started. Save the file in a secure location.');
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : 'Could not download the archive.', true);
    } finally { setDownloadingId(null); }
  }

  async function remove(archive: Archive) {
    if (deletingId || archive.status === 'RUNNING') return;
    if (!window.confirm(`Permanently delete the ${dateLabel(archive.createdAt)} backup? This cannot be undone.`)) return;
    setDeletingId(archive.id); flash('');
    try {
      await api(`/api/backups/${archive.id}`, { method: 'DELETE' });
      if (selectedId === archive.id) setSelectedId(null);
      flash('Backup deleted.'); await refresh();
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : 'The backup could not be deleted.', true);
    } finally { setDeletingId(null); }
  }

  return <main className="page-wrap page-space workspace" data-dm-backup-center="archive-history-v2">
    <section className="workspace-hero">
      <div className="workspace-hero__top">
        <div>
          <span className="workspace-kicker"><DatabaseBackup size={15} /> DATA MANAGEMENT</span>
          <h1>Database Backup</h1>
          <p>Manage saved backups, review archive history, and schedule routine exports.</p>
        </div>
        <div className="workspace-hero__actions">
          <button className="btn btn-outline" type="button" onClick={() => void refresh()} disabled={loading || busy}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn" type="button" onClick={() => void create()} disabled={!canCreate || busy || loading}>
            <DatabaseBackup size={17} /> {busy ? 'Creating backup…' : 'Create backup'}
          </button>
        </div>
      </div>
    </section>

    {notice && <div role={failed ? 'alert' : 'status'} className={`workspace-banner workspace-section ${failed ? 'workspace-banner--error' : 'workspace-banner--success'}`}>
      {failed ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}{notice}
    </div>}
    {error && <div className="workspace-banner workspace-banner--error workspace-section" role="alert"><AlertTriangle size={18} /> Could not load backup history. {error}</div>}
    {data && !data.configured && <section className="workspace-card workspace-section border border-amber-200" role="status" aria-label="Backup configuration">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-700" />
        <div>
          <h2 className="font-bold text-[#143d5e]">Backup configuration required</h2>
          <p className="mt-1 text-sm text-slate-600">The following server settings need attention before backups can be created:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#234761]">
            {(data.setupIssues ?? []).map(issue => <li key={issue}>
              {issue === 'SUPABASE_URL' ? 'Supabase project URL is missing or invalid.' :
                issue === 'SUPABASE_SERVER_KEY' ? 'Supabase server access key is missing or does not have the required privileges.' :
                data.archiveKeyStatus === 'MISSING' ? 'Backup encryption key has not been configured on the server.' :
                data.archiveKeyStatus === 'TRAILING_BACKSLASH' ? 'Backup encryption key has an extra backslash at the end. Remove it from the server environment variable.' :
                'Backup encryption key must contain exactly 64 hexadecimal characters.'}
            </li>)}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Update the server environment variables, restart or redeploy the application, then refresh this page. Backup files are stored privately in Supabase.</p>
        </div>
      </div>
    </section>}
    {loading && !data && <div className="workspace-section"><DetailSkeleton label="Loading database backups" /></div>}

    <div className="grid gap-4 workspace-section sm:grid-cols-2 xl:grid-cols-4">
      <article className="workspace-card"><div className="flex items-center gap-2 text-[#547185]"><FileArchive size={17}/><span className="text-xs font-bold uppercase tracking-wide">Available archives</span></div>
        <p className="mt-3 text-3xl font-extrabold text-[#143d5e]">{successes.length}</p><p className="workspace-muted mt-1">Stored database copies</p></article>
      <article className="workspace-card"><div className="flex items-center gap-2 text-[#547185]"><HardDrive size={17}/><span className="text-xs font-bold uppercase tracking-wide">Stored archive size</span></div>
        <p className="mt-3 text-3xl font-extrabold text-[#143d5e]">{sizeLabel(successes.reduce((sum, x) => sum + (x.sizeBytes ?? 0), 0))}</p><p className="workspace-muted mt-1">Last {history.length} history entries</p></article>
      <article className="workspace-card"><div className="flex items-center gap-2 text-[#547185]"><Clock3 size={17}/><span className="text-xs font-bold uppercase tracking-wide">Latest backup</span></div>
        <p className="mt-3 text-base font-extrabold text-[#143d5e]">{latest ? dateLabel(latest.completedAt) : 'No backups yet'}</p><p className="workspace-muted mt-1">{latest ? `${latest.rowCount?.toLocaleString('en-PH') ?? 0} records captured` : 'Create your first archive'}</p></article>
      <article className="workspace-card"><div className="flex items-center gap-2 text-[#547185]"><CalendarClock size={17}/><span className="text-xs font-bold uppercase tracking-wide">Automatic backup</span></div>
        <p className="mt-3 text-xl font-extrabold text-[#143d5e]">{currentFrequency === 'OFF' ? 'Off' : currentFrequency === 'DAILY' ? 'Daily' : currentFrequency === 'WEEKLY' ? 'Weekly' : 'Monthly'}</p>
        <p className="workspace-muted mt-1">{data?.schedule.nextRunAt ? `Next: ${dateLabel(data.schedule.nextRunAt)}` : 'No upcoming run'}</p></article>
    </div>

    <div className="grid gap-5 workspace-section lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
      <section className="workspace-card">
        <div className="workspace-section__heading"><div><h2>Backup activity</h2><p>Compressed archive sizes from recent successful backups.</p></div></div>
        {chart.length ? <div className="mt-6 flex h-48 items-end gap-3 border-b border-slate-200 pb-2" role="img" aria-label="Backup archive sizes, from oldest to newest">
          {chart.map((item, i) => <div key={item.id} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div className="flex flex-1 items-end"><div className="w-full rounded-t-md bg-sky-700 transition-colors group-hover:bg-sky-500" style={{height: `${Math.max(8, ((item.sizeBytes ?? 0) / maxSize) * 100)}%`}} title={`${sizeLabel(item.sizeBytes)} · ${dateLabel(item.createdAt)}`}/></div>
            <span className="truncate text-center text-[10px] font-semibold text-slate-500">{new Date(item.createdAt).toLocaleDateString('en-PH', {month: 'short', day: 'numeric', timeZone: 'Asia/Manila'})}</span>
            <span className="sr-only">Backup {i + 1}: {sizeLabel(item.sizeBytes)}</span>
          </div>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Backup activity will appear after your first successful archive.</div>}
      </section>
      <section className="workspace-card">
        <div className="workspace-section__heading"><div><h2>Automatic backups</h2><p>Keep a current archive on a regular schedule.</p></div></div>
        <label htmlFor="backup-frequency" className="mt-5 block text-sm font-semibold text-[#143d5e]">Frequency</label>
        <select id="backup-frequency" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900" value={frequency}
          onChange={e => setFrequencyDraft(e.target.value as Frequency)} disabled={!canCreate || savingSchedule}>
          <option value="OFF">Off</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly — Mondays</option><option value="MONTHLY">Monthly — 1st day</option>
        </select>
        <p className="workspace-muted mt-3">Scheduled backups run at approximately 12:15 AM Philippine time. Timing may vary by hosting plan.</p>
        {frequency !== 'OFF' && data && !data.schedulerConfigured && <div className="mt-3 text-xs font-medium text-amber-800">Automatic scheduling needs server configuration before it can be enabled.</div>}
        <button className="btn mt-4 w-full justify-center" type="button" onClick={() => void saveFrequency()}
          disabled={savingSchedule || !data || frequency === currentFrequency || !canCreate || (frequency !== 'OFF' && !data.schedulerConfigured)}>
          <CalendarClock size={16}/>{savingSchedule ? 'Saving…' : 'Save schedule'}
        </button>
      </section>
    </div>

    <section className="workspace-card workspace-section">
      <div className="workspace-section__heading flex-wrap gap-3"><div><h2>Backup history</h2><p>Review stored archives, inspect their contents, and download a copy.</p></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter backup history">
          {(['ALL','MANUAL','SCHEDULED'] as const).map(option => <button key={option} type="button" onClick={() => setFilter(option)}
            aria-pressed={filter === option} className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === option ? 'bg-sky-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {option === 'ALL' ? 'All' : option === 'MANUAL' ? 'Manual' : 'Automatic'}
          </button>)}
        </div></div>
      {filtered.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500"><tr>
          <th className="p-3">Created</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Records</th><th className="p-3">File size</th><th className="p-3 text-right">Actions</th>
        </tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <td className="p-3 font-semibold text-[#234761]">{dateLabel(item.createdAt)}</td>
          <td className="p-3 text-slate-600">{item.source === 'MANUAL' ? 'Manual' : 'Scheduled'}</td>
          <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
            {item.status === 'SUCCESS' ? 'Completed' : item.status === 'FAILED' ? 'Failed' : 'In progress'}</span></td>
          <td className="p-3 text-slate-600">{item.rowCount?.toLocaleString('en-PH') ?? '—'}</td><td className="p-3 text-slate-600">{sizeLabel(item.sizeBytes)}</td>
          <td className="p-3"><div className="flex items-center justify-end gap-1">
            <button className="rounded-lg px-2 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-50" type="button" onClick={() => setSelectedId(selectedId === item.id ? null : item.id)} aria-expanded={selectedId === item.id}>Details <ChevronDown className="inline" size={13}/></button>
            <button title="Download backup" aria-label={`Download ${dateLabel(item.createdAt)} backup`} className="rounded-lg p-2 text-sky-800 hover:bg-sky-50 disabled:opacity-40" type="button"
              disabled={item.status !== 'SUCCESS' || downloadingId !== null} onClick={() => void download(item)}><CloudDownload size={17}/></button>
            <button title="Delete backup" aria-label={`Delete ${dateLabel(item.createdAt)} backup`} className="rounded-lg p-2 text-red-700 hover:bg-red-50 disabled:opacity-40" type="button"
              disabled={item.status === 'RUNNING' || deletingId !== null} onClick={() => void remove(item)}><Trash2 size={16}/></button>
          </div></td>
        </tr>)}</tbody></table></div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500"><History className="mx-auto mb-2" size={24}/>No backup records in this view.</div>}

      {selected && <section className="mt-5 rounded-xl border border-sky-100 bg-[#f7fbff] p-4 sm:p-5" aria-label="Selected backup details">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[#143d5e]">Backup details</h3>
          <p className="mt-1 break-all text-xs text-slate-500">{selected.filename ?? `Archive ${selected.id}`}</p></div>
          <button type="button" aria-label="Close backup details" className="rounded-lg p-2 hover:bg-white" onClick={() => setSelectedId(null)}><XCircle size={18}/></button></div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><span className="text-slate-500">Completed</span><p className="font-semibold text-slate-800">{dateLabel(selected.completedAt)}</p></div>
          <div><span className="text-slate-500">Tables</span><p className="font-semibold text-slate-800">{selected.tableCount ?? '—'}</p></div>
          <div><span className="text-slate-500">Records</span><p className="font-semibold text-slate-800">{selected.rowCount?.toLocaleString('en-PH') ?? '—'}</p></div>
        </div>
        {selected.error && <p className="mt-3 text-sm text-red-700">{selected.error}</p>}
        {!!selected.tableRows?.length && <div className="mt-4"><h4 className="mb-2 text-sm font-bold text-[#143d5e]">Records by table</h4>
          <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">{selected.tableRows.map(t => <div key={t.name} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-2.5 text-xs"><span className="truncate font-medium text-slate-700">{t.name.replaceAll('_', ' ')}</span><span className="ml-3 font-bold tabular-nums text-sky-900">{t.rows.toLocaleString('en-PH')}</span></div>)}</div>
        </div>}
        {selected.status === 'SUCCESS' && <button type="button" onClick={() => void download(selected)} className="btn mt-4" disabled={downloadingId !== null}><Download size={16}/>Download archive</button>}
      </section>}
    </section>

    <section className="workspace-card workspace-section">
      <div className="flex items-center gap-2 text-[#143d5e]"><LockKeyhole size={19}/><h2>Data protection</h2></div>
      <div className="mt-3 grid gap-4 text-sm leading-6 text-[#536a7d] lg:grid-cols-2">
        <p><ShieldCheck className="mr-1 inline text-emerald-700" size={16}/>Stored backup files are encrypted and restricted to authorized administrators. Downloaded files should be kept in a secure location.</p>
        <p><Database className="mr-1 inline text-sky-700" size={16}/>Exports contain application database records. Uploaded media, managed authentication data, and database structure are maintained separately.</p>
      </div>
      {canSettings && <Link href="/admin/maintenance/settings?tab=policy" className="mt-3 inline-block text-sm font-semibold text-sky-800 hover:underline">Recovery and data protection information</Link>}
    </section>
  </main>;
}
