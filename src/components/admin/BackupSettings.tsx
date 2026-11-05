'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, DatabaseBackup, Download, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function BackupSettings({ canBackups = true }: { canBackups?: boolean }) {
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div>
      <span className="workspace-kicker"><ShieldCheck size={15}/> SYSTEM SETTINGS</span>
      <h1>Automatic backup policy</h1>
      <p>Private, encrypted backups using your existing Supabase and Vercel accounts. No Cloudflare R2 or GitHub backup workflow.</p>
    </div></div></section>
    <div className="workspace-grid workspace-section">
      <section className="workspace-card">
        <div className="workspace-section__heading"><div><h2>Editable backup schedule and retention</h2><p>Scheduling runs on Vercel Production.</p></div></div>
        <div className="grid gap-4 text-sm leading-6 text-[#496279]">
          <p className="flex items-start gap-3"><CalendarClock className="mt-0.5 shrink-0 text-blue-700" size={20}/> Choose Daily, Weekly (Monday), or Monthly (1st) in Backup Center. Runs occur around 2:00 AM Philippine time. A single daily Vercel cron checks the saved preference and skips non-scheduled days.</p>
          <p className="flex items-start gap-3"><DatabaseBackup className="mt-0.5 shrink-0 text-blue-700" size={20}/> The newest seven successful automatic snapshots are retained. Manual backups stay until an authorized user deletes them.</p>
          <p className="flex items-start gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-blue-700" size={20}/> Database archives are encrypted with <code>BACKUP_ENCRYPTION_KEY</code> and stored in a private Supabase bucket.</p>
          <p className="flex items-start gap-3"><Download className="mt-0.5 shrink-0 text-blue-700" size={20}/> Download copies for off-platform disaster recovery and verify a sample restore in an empty staging database.</p>
        </div>
        {canBackups && <Link href="/admin/maintenance/settings?tab=backups" className="btn mt-6 inline-flex items-center gap-2"><DatabaseBackup size={18}/> Open Backup Center <ArrowRight size={17}/></Link>}
      </section>
      <aside className="workspace-stack"><div className="workspace-card"><h2 className="font-bold text-[#143d5e]">Before deployment</h2>
        <p className="workspace-muted mt-3">Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKUP_ENCRYPTION_KEY and CRON_SECRET in Vercel Production, then redeploy.</p>
        <p className="workspace-muted mt-3">The bucket is created automatically on the first successful backup. Keep it private.</p>
      </div><div className="workspace-banner workspace-banner--warning"><AlertTriangle size={18} className="shrink-0"/><span>Automatic backups are best-effort. Vercel free-tier functions and storage quotas apply, and a backup does not replace offsite copies.</span></div></aside>
    </div>
  </main>;
}
