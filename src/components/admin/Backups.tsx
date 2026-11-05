'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileArchive, HardDrive, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';

type BackupStatus = {
  mode: 'manual-download';
  implementation?: string;
  configured: boolean;
  message: string;
  includes: string;
  excludes: string;
};

type DownloadInfo = { filename: string; tables: string; rows: string; time: string };

/** A backup is saved to the current device. There is no cloud runner, online history or subscription. */
export default function Backups({ canSettings = false }: { canSettings?: boolean }) {
  const { data, error, refresh, loading } = useLiveQuery(
    async () => {
      const status = await api<BackupStatus>('/api/backups');
      if (status.mode !== 'manual-download') {
        throw new Error('The server is running the retired backup API. Redeploy the latest Simple Backup code to Vercel.');
      }
      return status;
    }, [],
    { cacheKey: 'admin:/api/backups', realtimeKinds: [] },
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const [lastDownload, setLastDownload] = useState<DownloadInfo | null>(null);

  async function downloadBackup() {
    if (busy || !data?.configured) return;
    if (!window.confirm('Download a copy of the DM Events database to this device? The file contains private client and account information. Keep it in a secure folder.')) return;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      const response = await fetch('/api/backups', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) {
        let message = `Backup request failed (${response.status}).`;
        try {
          const body: { error?: string } = await response.json();
          if (body?.error) message = body.error;
        } catch { /* A proxy can return a non-JSON error page. */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('The server returned an empty backup file.');
      const header = response.headers.get('Content-Disposition') ?? '';
      const filename = /filename="([^"]+\.json\.gz)"/.exec(header)?.[1]
        ?? `DM-Events-Backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      setLastDownload({
        filename,
        tables: response.headers.get('X-DM-Backup-Tables') ?? '—',
        rows: response.headers.get('X-DM-Backup-Rows') ?? '—',
        time: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }),
      });
      setNotice('Backup file prepared. Verify that it appears in your device Downloads folder and save an additional secure copy.');
    } catch (cause) {
      setFailed(true);
      setNotice(cause instanceof Error ? cause.message : 'Could not download the backup.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="page-wrap page-space workspace" data-dm-backup-center="manual-download-vercel-v2">
    <section className="workspace-hero">
      <div className="workspace-hero__top"><div>
        <span className="workspace-kicker"><HardDrive size={15} /> NO SUBSCRIPTION · NO PAYMENT METHOD</span>
        <h1>Simple Backup Center</h1>
        <p>Download a copy of the DM Events database directly to your device. No Cloudflare, GitHub runner, card or billing setup.</p>
      </div>
        <div className="workspace-hero__actions"><button type="button" className="btn btn-outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Check connection</button></div>
      </div>
    </section>

    {error && <div role="alert" className="workspace-banner workspace-banner--error workspace-section">
      <AlertTriangle size={18} className="shrink-0" />
      <span>Backup connection error: {error}. If it is a 404, Vercel is not serving the current <code>/api/backups</code> route. Check that the newest commit is deployed to the correct Vercel project and that its Root Directory and Framework Preset are set correctly.</span>
    </div>}

    <section className="workspace-section rounded-2xl border border-[#c5daea] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e9f3ff] text-[#12508a]"><DatabaseBackup size={24} /></span>
          <div>
            <p className="text-[11px] font-extrabold tracking-[.12em] text-[#3e789d]">ONE-CLICK MANUAL BACKUP</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#123a59]">Download database backup</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#627b90]">Creates a compressed <code>.json.gz</code> snapshot of all data in your PostgreSQL <code>public</code> tables, including accounts, bookings, messages and permissions. It downloads to the current device.</p>
            <p className="mt-2 text-xs leading-5 text-[#627b90]">For a simple project and a small database. Files are not saved in the web app or automatically uploaded to the cloud.</p>
          </div>
        </div>
        <div className="w-full shrink-0 lg:w-auto lg:min-w-56">
          <button type="button" className="btn w-full justify-center" onClick={() => void downloadBackup()} disabled={busy || !data?.configured}>
            <Download size={18} />{busy ? 'Preparing backup…' : 'Download backup'}
          </button>
          <p className="mt-2 text-center text-xs text-[#567187]">{loading && !data ? 'Checking backup configuration…' : data?.configured ? 'Database URL configured · manual download' : 'DATABASE_URL is missing'}</p>
        </div>
      </div>
      {notice && <div role={failed ? 'alert' : 'status'} className={`workspace-banner mt-5 ${failed ? 'workspace-banner--error' : 'workspace-banner--success'}`}>
        {failed ? <AlertTriangle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}{notice}
      </div>}
      {lastDownload && <div className="mt-4 rounded-xl border border-[#c7e7d6] bg-[#f1fbf6] p-4 text-sm text-[#285e46]">
        <strong>Most recent download in this browser session</strong>
        <p className="mt-1 break-all">{lastDownload.filename}</p>
        <p className="mt-1">{lastDownload.tables} tables · {lastDownload.rows} rows · {lastDownload.time}</p>
        <p className="mt-1 text-xs">This does not prove the file was saved. Check your Downloads folder.</p>
      </div>}
    </section>

    {loading && !data && <div className="workspace-section"><DetailSkeleton label="Checking backup availability" /></div>}
    <div className="workspace-grid workspace-section">
      <section className="workspace-card">
        <div className="workspace-section__heading"><div><h2>What is included?</h2><p>The snapshot covers current records, not separate uploaded files.</p></div></div>
        <div className="grid gap-4 text-sm leading-6 text-[#4c667b]">
          <p className="flex gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={19} /> Data in your application&apos;s PostgreSQL public tables: clients, staff, bookings, event schedules, messages, package details, review ratings, permissions and audit history.</p>
          <p className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={19} /> Cloudinary image binaries, Supabase-managed Storage/Auth data, environment secrets and the PostgreSQL table definitions are <strong>not</strong> included. Keep the project source and migrations separately.</p>
          <p className="flex gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-sky-800" size={19} /> The download contains personal information and password hashes. Treat it as sensitive and never place it in a public folder or repository.</p>
        </div>
      </section>
      <aside className="workspace-stack">
        <section className="workspace-card">
          <div className="flex items-center gap-2 text-[#143d5e]"><FileArchive size={19} /><h3>How to use it</h3></div>
          <p className="workspace-muted mt-3">1. Click <strong>Download backup</strong>.</p>
          <p className="workspace-muted mt-2">2. Keep the <code>.json.gz</code> file somewhere safe (for example, an encrypted USB drive).</p>
          <p className="workspace-muted mt-2">3. Make a new backup before major updates and regularly while the system is in use.</p>
          <p className="workspace-muted mt-3">To check or restore a backup later, use the included local scripts. Restore is intentionally limited to an <strong>empty test database</strong>, not a button that overwrites production data.</p>
          {canSettings && <Link href="/admin/maintenance/settings?tab=policy" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0b4d98] hover:underline"><ShieldCheck size={16} /> Backup instructions</Link>}
        </section>
        <div className="workspace-banner workspace-banner--warning"><AlertTriangle size={18} className="shrink-0" /><span>Manual backup is not automatic. If this device is lost, a file stored only on that device may also be lost.</span></div>
      </aside>
    </div>
  </main>;
}
