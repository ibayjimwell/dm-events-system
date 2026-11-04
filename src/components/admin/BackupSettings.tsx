'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, DatabaseBackup, FileArchive, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function BackupSettings({ canBackups = true }: { canBackups?: boolean }) {
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero">
      <div className="workspace-hero__top"><div>
        <span className="workspace-kicker"><ShieldCheck size={15} /> SYSTEM ADMINISTRATION</span>
        <h1>Backup &amp; Recovery</h1>
        <p>Review backup and recovery procedures for your application records.</p>
      </div></div>
    </section>
    <div className="workspace-grid workspace-section">
      <section className="workspace-card">
        <div className="workspace-section__heading"><div>
          <h2>Database exports</h2>
          <p>Review and manage stored snapshots from the Database Backup section.</p>
        </div></div>
        <div className="space-y-5 text-sm leading-6 text-[#496279]">
          <div className="flex items-start gap-3">
            <FileArchive className="mt-0.5 shrink-0 text-[#0b4d98]" size={20} />
            <p>Exports are retained in private archive storage, with a download option for local safekeeping.</p>
          </div>
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 shrink-0 text-[#0b4d98]" size={20} />
            <p>Only authorized accounts with backup management access can create exports.</p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-[#0b4d98]" size={20} />
            <p>Stored archives are encrypted. Downloaded copies must be handled as confidential records.</p>
          </div>
        </div>
        {canBackups && <Link href="/admin/maintenance/settings?tab=backups" className="btn mt-6 inline-flex items-center gap-2"><DatabaseBackup size={18} /> Open database backups <ArrowRight size={17} /></Link>}
      </section>
      <aside className="workspace-stack">
        <section className="workspace-card">
          <h2 className="font-bold text-[#143d5e]">Retention and recovery</h2>
          <p className="workspace-muted mt-3">Automatic weekly and monthly backups can be scheduled in the Database Backup section. Keep a separate protected copy for disaster recovery.</p>
          <p className="workspace-muted mt-3">Database exports do not include uploaded media, application source files, or the schema migrations needed to rebuild the database.</p>
        </section>
        <div className="workspace-banner workspace-banner--warning">
          <AlertTriangle size={18} className="shrink-0" />
          <span>Recovery requires a verified backup and a controlled restore procedure. Test recovery on a separate database before an emergency occurs.</span>
        </div>
      </aside>
    </div>
  </main>;
}
