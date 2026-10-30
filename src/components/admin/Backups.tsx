'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArchiveRestore,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Cloud,
  DatabaseBackup,
  ExternalLink,
  HardDriveDownload,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';

type Backup = {
  id: string;
  createdAt: string;
  status: string;
  sizeBytes: number | null;
  error: string | null;
};

type BackupsResponse = {
  logs: Backup[];
  configured: boolean;
  missingConfiguration: string[];
  provider: string;
  runner: string;
  settings: {
    backupsEnabled: boolean;
    retentionDays: number;
  } | null;
};

function statusStyle(status: string) {
  if (status === 'SUCCESS') return 'border-[#b9e6ce] bg-[#e8f8ef] text-[#207449]';
  if (status === 'FAILED') return 'border-[#f1c2c2] bg-[#fff0f0] text-[#ac3f43]';
  return 'border-[#efdcb5] bg-[#fff7e7] text-[#846329]';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
}

function formatSize(sizeBytes: number | null) {
  return sizeBytes === null ? '—' : `${(sizeBytes / 1048576).toFixed(2)} MB`;
}

const requiredVariables = [
  'BACKUP_GITHUB_TOKEN',
  'BACKUP_GITHUB_OWNER',
  'BACKUP_GITHUB_REPO',
  'BACKUP_GITHUB_REF',
];

/** Backups are executed by GitHub Actions, never from the browser or a Vercel request. */
export default function Backups({ canSettings = false }: { canSettings?: boolean }) {
  const { data, error, refresh, loading } = useLiveQuery(
    () => api<BackupsResponse>('/api/backups'),
    [],
    { cacheKey: 'admin:/api/backups', realtimeKinds: ['backup_logs'] },
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);

  const logs = data?.logs ?? [];
  const success = logs.filter(log => log.status === 'SUCCESS').length;
  const pending = logs.filter(log => ['QUEUED', 'RUNNING'].includes(log.status)).length;
  const configured = data?.configured === true;
  const missing = data?.missingConfiguration ?? (configured ? [] : requiredVariables);
  const canQueue = configured && !busy;

  async function requestBackup() {
    if (busy || !configured) return;
    if (!window.confirm('Queue a new encrypted PostgreSQL backup in GitHub Actions? This operation uploads to your private Cloudflare R2 bucket.')) return;

    setBusy(true);
    setNotice('');
    setNoticeError(false);
    try {
      const result = await api<{ status: string; message: string }>('/api/backups', { method: 'POST' });
      // A 202 response means only that GitHub accepted the job, not that R2 has a backup.
      setNotice(result.message || 'Backup queued. Monitor GitHub Actions and refresh the history for the result.');
      await refresh();
    } catch (cause) {
      setNoticeError(true);
      setNotice(cause instanceof Error ? cause.message : 'Unable to queue the backup.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap page-space workspace" data-dm-backup-center="r2-v2">
      <section className="workspace-hero">
        <div className="workspace-hero__top">
          <div>
            <span className="workspace-kicker"><Cloud size={15} /> CLOUDFLARE R2 · GITHUB ACTIONS</span>
            <h1>R2 Backup Center</h1>
            <p>Queue a secure PostgreSQL backup, check its status, and verify your off-site backup configuration.</p>
          </div>
          <div className="workspace-hero__actions">
            <button type="button" className="btn btn-outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh status
            </button>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="workspace-banner workspace-banner--error workspace-section">
        <AlertCircle size={18} className="shrink-0" /> Unable to load backup status: {error}
      </div>}

      <section aria-label="Queue a new Cloudflare R2 backup" className="workspace-section rounded-2xl border border-[#c5daea] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e9f3ff] text-[#12508a]"><DatabaseBackup size={24} /></span>
            <div>
              <p className="text-[11px] font-extrabold tracking-[.12em] text-[#3e789d]">MANUAL BACKUP</p>
              <h2 className="mt-1 text-xl font-extrabold text-[#123a59]">Create an encrypted database backup</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#627b90]">The Web App sends an authorized request to GitHub Actions. Its runner exports PostgreSQL, encrypts the file, and uploads it to your private R2 bucket. You can continue using DM Events while it runs.</p>
              <p className="mt-2 text-xs text-[#627b90]">Queueing is not proof of a successful backup. Check the history for SUCCESS and test a restore separately.</p>
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 lg:w-auto lg:min-w-56">
            <button type="button" className="btn w-full justify-center" disabled={!canQueue} onClick={() => void requestBackup()} aria-describedby="r2-runner-state">
              <DatabaseBackup size={17} /> {busy ? 'Queuing…' : 'Queue R2 backup'}
            </button>
            <p id="r2-runner-state" role="status" className="text-center text-xs text-[#567187]">
              {!data ? 'Checking the runner connection…' : configured ? 'Runner configured · ready to queue' : 'Configuration required before manual queueing'}
            </p>
          </div>
        </div>
        {notice && <p role={noticeError ? 'alert' : 'status'} className={`workspace-banner mt-5 ${noticeError ? 'workspace-banner--error' : 'workspace-banner--success'}`}>{notice}</p>}
      </section>

      <div className="workspace-metrics">
        <article className="workspace-metric">
          <div className="workspace-metric__icon"><Cloud size={20} /></div>
          <div className="workspace-metric__label">GitHub runner</div>
          <div className="mt-3">
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold ${configured ? statusStyle('SUCCESS') : statusStyle('QUEUED')}`}>
              {!data ? 'CHECKING' : configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
            </span>
          </div>
          <div className="workspace-metric__hint">Credentials checked server-side</div>
        </article>
        <article className="workspace-metric">
          <div className="workspace-metric__icon"><HardDriveDownload size={20} /></div>
          <div className="workspace-metric__label">Successful backups (recent 100)</div>
          <div className="workspace-metric__value">{success}</div>
          <div className="workspace-metric__hint">Verified R2 uploads recorded in the database</div>
        </article>
        <article className="workspace-metric">
          <div className="workspace-metric__icon"><Clock3 size={20} /></div>
          <div className="workspace-metric__label">Queued or running</div>
          <div className="workspace-metric__value">{pending}</div>
          <div className="workspace-metric__hint">Refresh to view completed work</div>
        </article>
      </div>

      {!configured && data && (
        <section className="workspace-section rounded-2xl border border-[#f0d5a2] bg-[#fff9ec] p-5 sm:p-6" aria-label="Backup setup required">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 shrink-0 text-[#a06b22]" size={21} />
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-[#754d1b]">Connect the GitHub Actions runner</h2>
              <p className="mt-2 text-sm leading-6 text-[#7d603d]">These environment variables are missing on your <strong>Vercel server</strong>. Add them in Vercel → Project → Settings → Environment Variables, then redeploy the project. Do not put GitHub tokens in browser code or variables beginning with NEXT_PUBLIC_.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {missing.map(name => <code key={name} className="max-w-full break-all rounded-md border border-[#e4c991] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#684e2e]">{name}</code>)}
              </div>
              <p className="mt-3 text-xs leading-5 text-[#7d603d]">This checks whether the variables are present, not whether GitHub and R2 credentials are valid. A successful test backup is still required. The scheduled workflow can also be run directly from GitHub Actions.</p>
            </div>
          </div>
        </section>
      )}

      <div className="workspace-grid workspace-section">
        <section className="workspace-card">
          <div className="workspace-section__heading">
            <div><h2>Backup history</h2><p>Latest 100 database logs, newest first. All timestamps use Philippine time.</p></div>
          </div>
          {loading && !data ? <ListSkeleton label="Loading backup history" rows={4} /> : (
            <>
              <div className="workspace-table">
                <table>
                  <thead><tr><th>Requested</th><th>Status</th><th>Encrypted size</th></tr></thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id}>
                        <td><span className="font-semibold">{formatDate(log.createdAt)}</span><p className="workspace-muted break-all">{log.id}</p></td>
                        <td><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyle(log.status)}`}>{log.status}</span>
                          {log.error && <p className="mt-2 max-w-xs break-words text-xs text-[#ab4049]">{log.error}</p>}
                        </td>
                        <td>{formatSize(log.sizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!logs.length && <div className="workspace-empty mt-3"><DatabaseBackup size={28} className="mx-auto text-[#90aabc]" /><strong>No backups recorded</strong><p className="mt-1 text-sm">Queue the first backup above, or start the workflow in GitHub Actions.</p></div>}
            </>
          )}
        </section>

        <aside className="workspace-stack">
          <section className="workspace-card">
            <div className="flex items-center gap-2 text-[#143d5e]"><Settings2 size={19} /><h3>Backup configuration</h3></div>
            <p className="workspace-muted mt-3">The daily schedule is controlled through System Settings. Manual backups require the GitHub credentials on Vercel; database and R2 credentials belong in GitHub Actions secrets.</p>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3"><span>Automatic policy</span><strong>{data?.settings?.backupsEnabled ? 'Enabled' : 'Disabled'}</strong></div>
              <div className="flex items-center justify-between gap-3"><span>Retention policy</span><strong>{data?.settings?.retentionDays ?? '—'} days</strong></div>
            </div>
            {canSettings && <Link href="/admin/maintenance/settings?tab=policy" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0b4d98] hover:underline">Manage system settings <ArrowRight size={16} /></Link>}
            <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#0b4d98] hover:underline">GitHub token settings <ExternalLink size={14} /></a>
          </section>
          <div className="workspace-banner"><ShieldCheck size={18} className="shrink-0" /><span>Private R2 objects are encrypted with AES-256-GCM. Never expose the bucket publicly or commit encryption keys.</span></div>
          <div className="workspace-banner workspace-banner--warning"><AlertCircle size={18} className="shrink-0" /><span>Database snapshots do not contain Cloudinary media binaries. Back up external media and other linked services separately.</span></div>
          <div className="workspace-banner"><ArchiveRestore size={18} className="shrink-0" /><span>Restoration is deliberately CLI-only with npm run restore. Verify the archive and test a restore into a disposable database before depending on it.</span></div>
          {success > 0 && <div className="workspace-banner workspace-banner--success"><CheckCircle2 size={18} className="shrink-0" /><span>At least one encrypted backup upload has completed. Test restoration regularly.</span></div>}
        </aside>
      </div>
    </main>
  );
}
