'use client';

import Link from 'next/link';
import { CheckCircle2, DatabaseBackup, HardDriveDownload, LockKeyhole, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';

/** The old R2/GitHub scheduled policy is deliberately retired. There are no cloud credentials or switches. */
export default function BackupSettings({ canBackups = true }: { canBackups?: boolean }) {
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div>
      <span className="workspace-kicker"><ShieldCheck size={15} /> SYSTEM SETTINGS</span>
      <h1>Simple backup settings</h1>
      <p>There are no subscriptions, storage credentials or scheduled jobs to configure.</p>
    </div></div></section>
    <div className="workspace-grid workspace-section">
      <section className="workspace-card">
        <div className="workspace-section__heading"><div><h2>Manual backups</h2><p>Download database records when needed. The downloaded file belongs to you.</p></div>
          <span className="workspace-pill workspace-pill--good">READY</span>
        </div>
        <div className="grid gap-5 text-sm text-[#496279]">
          <p className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-green-700" size={20} /> No Google Cloud, Cloudflare R2 or GitHub Actions setup.</p>
          <p className="flex items-start gap-3"><HardDriveDownload className="mt-0.5 shrink-0 text-blue-700" size={20} /> Download a compressed database snapshot to your laptop or phone.</p>
          <p className="flex items-start gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-blue-700" size={20} /> Only accounts granted <code>backups.manage</code> can access the export endpoint.</p>
        </div>
        {canBackups && <Link href="/admin/maintenance/settings?tab=backups" className="btn mt-6 inline-flex items-center gap-2"><DatabaseBackup size={18} /> Open Backup Center <ArrowRight size={17} /></Link>}
      </section>
      <aside className="workspace-stack">
        <section className="workspace-card"><h2 className="font-bold text-[#143d5e]">Backup reminders</h2>
          <p className="workspace-muted mt-3">Create a fresh backup before migrations, data cleanup, and major feature updates. Keep two copies on separate private devices.</p>
          <p className="workspace-muted mt-3">The export includes database records, but not external uploaded images. Also retain the source code, database migrations, and any Cloudinary media you need to recover.</p>
        </section>
        <div className="workspace-banner workspace-banner--warning"><AlertTriangle size={18} className="shrink-0" /><span>There is no automatic backup schedule. A successful download requires you to save the file securely.</span></div>
      </aside>
    </div>
  </main>;
}
