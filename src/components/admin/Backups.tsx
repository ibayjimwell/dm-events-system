'use client';

import { useState } from 'react';
import { Database, DatabaseBackup, RefreshCw, AlertTriangle, ShieldCheck, HardDriveDownload, ArchiveRestore, Clock3, Cloud, ExternalLink } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';

type Backup = { id: string; createdAt: string; status: string; sizeBytes: number | null; error: string | null };
type BackupsResponse = { logs: Backup[]; configured: boolean; provider: string; runner: string; settings: { backupsEnabled: boolean; retentionDays: number } | null };

export default function Backups() {
  const { data, error, refresh, loading } = useLiveQuery(() => api<BackupsResponse>('/api/backups'), [], { cacheKey: 'admin:/api/backups', realtimeKinds: ['backup_logs'] });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);

  async function run() {
    if (!window.confirm('Queue an encrypted PostgreSQL backup in GitHub Actions for private Cloudflare R2 storage?')) return;
    setBusy(true); setNotice(''); setNoticeError(false);
    try {
      const result = await api<{ status: string; message: string }>('/api/backups', { method: 'POST' });
      setNotice(result.message || 'Backup queued. Check GitHub Actions and refresh history for the result.');
      await refresh();
    } catch (cause) {
      setNoticeError(true);
      setNotice(cause instanceof Error ? cause.message : 'Unable to request backup.');
    } finally { setBusy(false); }
  }

  const logs = data?.logs ?? [];
  const success = logs.filter(item => item.status === 'SUCCESS').length;
  const pending = logs.filter(item => item.status === 'QUEUED' || item.status === 'RUNNING').length;
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><Cloud size={15}/> CLOUDFLARE R2 · SECURE DATABASE BACKUPS</span><h1>Backup & recovery history</h1><p>Private AES-256-GCM encrypted PostgreSQL snapshots executed outside Vercel by GitHub Actions. A queued request is not a completed backup.</p></div><div className="workspace-hero__actions"><button type="button" className="btn btn-outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16}/> Refresh history</button></div></div></section>
    {error && <p role="alert" className="workspace-banner workspace-banner--error workspace-section">{error}</p>}
    <div className="workspace-metrics">
      <div className="workspace-metric"><div className="workspace-metric__icon"><Database size={20}/></div><div className="workspace-metric__label">Backup runner</div><div className="mt-3"><span className={`workspace-pill ${data?.configured ? 'workspace-pill--good' : 'workspace-pill--warn'}`}>{data?.configured ? 'CONNECTED' : 'NOT CONFIGURED'}</span></div><div className="workspace-metric__hint">GitHub Actions → private R2 bucket</div></div>
      <div className="workspace-metric"><div className="workspace-metric__icon"><HardDriveDownload size={20}/></div><div className="workspace-metric__label">Successful uploads</div><div className="workspace-metric__value">{success}</div><div className="workspace-metric__hint">Confirm restore on a separate test database</div></div>
      <div className="workspace-metric"><div className="workspace-metric__icon"><Clock3 size={20}/></div><div className="workspace-metric__label">Queued or running</div><div className="workspace-metric__value">{pending}</div><div className="workspace-metric__hint">Refresh to see finished results</div></div>
    </div>
    <div className="workspace-grid workspace-section">
      <section className="workspace-card"><div className="workspace-section__heading"><div><h2>Backup history</h2><p>Database records from the backup runner; status changes are reflected after completion.</p></div></div>
        {loading && !data ? <ListSkeleton label="Loading backup history" rows={4}/> : <><div className="workspace-table"><table><thead><tr><th>Requested (Philippine time)</th><th>Status</th><th>Encrypted size</th></tr></thead><tbody>{logs.map(item => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}<div className="workspace-muted break-all">{item.id}</div></td><td><span className={`workspace-pill ${item.status === 'SUCCESS' ? 'workspace-pill--good' : item.status === 'FAILED' ? 'workspace-pill--bad' : 'workspace-pill--warn'}`}>{item.status}</span>{item.error && <p className="mt-2 break-words text-xs text-[#b33c4e]">{item.error}</p>}</td><td>{item.sizeBytes != null ? `${(item.sizeBytes / 1048576).toFixed(2)} MB` : '—'}</td></tr>)}</tbody></table></div>{!logs.length && <div className="workspace-empty mt-3"><DatabaseBackup size={25} className="mx-auto text-[#97aec2]"/><strong>No backup history yet</strong>Configure R2 and run a first backup from GitHub Actions or this page.</div>}</>}
      </section>
      <aside className="workspace-stack">
        <section className="workspace-card"><h3>Request a backup</h3><p className="workspace-muted mt-2">Starts an encrypted off-site backup on a GitHub-hosted runner. Your page stays responsive during the job.</p>
          <button type="button" disabled={busy || !data?.configured} onClick={() => void run()} className="btn mt-5 w-full"><DatabaseBackup size={17}/>{busy ? 'Queuing backup…' : 'Queue R2 backup'}</button>
          <button type="button" disabled={loading} onClick={() => void refresh()} className="btn btn-ghost mt-3 w-full"><RefreshCw size={16}/> Check result</button>
          {notice && <p role={noticeError ? 'alert' : 'status'} className={`workspace-banner mt-4 ${noticeError ? 'workspace-banner--error' : 'workspace-banner--success'}`}>{notice}</p>}
          {!data?.configured && <p className="mt-3 text-xs text-[#8b5c36]">For the Admin button, set BACKUP_GITHUB_TOKEN, BACKUP_GITHUB_OWNER, BACKUP_GITHUB_REPO and BACKUP_GITHUB_REF on the web server. Scheduled backups can still run from GitHub without these.</p>}
          <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0b4d98] hover:underline" href="https://developers.cloudflare.com/r2/get-started/s3/" target="_blank" rel="noopener noreferrer">Cloudflare R2 setup instructions <ExternalLink size={14}/></a>
        </section>
        <div className="workspace-banner"><ShieldCheck size={18} className="shrink-0"/><span>R2 stores encrypted database files privately. Do not enable a public bucket URL or commit encryption keys.</span></div>
        <div className="workspace-banner workspace-banner--warning"><AlertTriangle size={18} className="shrink-0"/><span>Database snapshots exclude separately stored Cloudinary image binaries and Supabase Auth/Storage service data. Back those up separately.</span></div>
        <div className="workspace-banner"><ArchiveRestore size={18} className="shrink-0"/><span>Restore is CLI-only via npm run restore -- &lt;BACKUP_UUID&gt; RESTORE-&lt;BACKUP_UUID&gt;. It is destructive: test against an isolated database first, never restore over production casually.</span></div>
      </aside>
    </div>
  </main>;
}
