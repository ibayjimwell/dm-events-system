'use client';

import { useEffect,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { DatabaseBackup, ShieldCheck, Save, Clock3, Info, ArrowRight, AlertTriangle } from 'lucide-react';
import { api,json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';

type Settings={backupsEnabled:boolean;retentionDays:number;backupFrequencyHours:24};

export default function BackupSettings({canBackups=true}:{canBackups?:boolean}) {
  const {data,loading,error}=useLiveQuery(()=>api<{settings:Settings}>('/api/settings'),[],{cacheKey:'admin:/api/settings',realtimeKinds:['system_settings']});
  const [enabled,setEnabled]=useState(false),[retention,setRetention]=useState(30),[notice,setNotice]=useState(''),[noticeError,setNoticeError]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{if(data?.settings){setEnabled(data.settings.backupsEnabled);setRetention(data.settings.retentionDays);}},[data]);
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setNotice('');setNoticeError(false);
    try {await api('/api/settings',json('PATCH',{backupsEnabled:enabled,retentionDays:retention,backupFrequencyHours:24}));setNotice('Backup preferences saved. A configured off-site destination and daily scheduler are still required for automatic execution.');}
    catch(cause){setNoticeError(true);setNotice(cause instanceof Error?cause.message:'Unable to save settings.');}
    finally{setBusy(false);}
  }
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><ShieldCheck size={15}/> SECURE MAINTENANCE</span><h1>System settings</h1><p>Configure backup preferences and understand what is required for reliable off-site retention.</p></div></div></section>
    {error&&<p role="alert" className="workspace-banner workspace-banner--error workspace-section">{error}</p>}
    {loading&&!data?<div className="workspace-section"><DetailSkeleton label="Loading system settings"/></div>:<div className="workspace-grid workspace-section">
      <section className="workspace-card"><div className="workspace-section__heading"><div><h2>Backup policy</h2><p>Settings affect future authorized backup operations.</p></div><span className={`workspace-pill ${enabled?'workspace-pill--good':'workspace-pill--warn'}`}>{enabled?'ENABLED':'DISABLED'}</span></div>
        <form onSubmit={save} className="grid gap-5">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#dce7ef] bg-[#f7fbfe] p-4"><span><strong className="block text-sm">Automatic backup policy</strong><small className="mt-1 block text-xs leading-5 text-[#6c8398]">Allow scheduled backup runs when the external scheduler and storage are configured.</small></span><input type="checkbox" className="h-5 w-5 accent-[#0b4d98]" checked={enabled} onChange={e=>setEnabled(e.target.checked)} /></label>
          <div className="grid gap-4 sm:grid-cols-2"><div className="field"><label htmlFor="backup-frequency">Backup frequency</label><input id="backup-frequency" value="Every 24 hours" readOnly aria-describedby="backup-frequency-note"/><p id="backup-frequency-note" className="workspace-muted mt-2">Included GitHub Actions workflow runs daily (schedule may be delayed).</p></div><div className="field"><label htmlFor="backup-retention">Retention period (days)</label><input id="backup-retention" type="number" min="1" max="365" value={retention} onChange={e=>setRetention(Number(e.target.value))} required /></div></div>
          <button type="submit" className="btn w-full sm:w-fit" disabled={busy}><Save size={17}/>{busy?'Saving settings…':'Save backup policy'}</button>
        </form>
        {notice&&<p role={noticeError?'alert':'status'} className={`workspace-banner mt-5 ${noticeError?'workspace-banner--error':'workspace-banner--success'}`}>{notice}</p>}
      </section>
      <aside className="workspace-stack"><section className="workspace-card"><div className="workspace-section__heading"><h2>Operational checklist</h2></div><div className="workspace-stack">{[{name:'Off-site object storage',detail:'Private Cloudflare R2 Standard bucket with bucket-scoped read/write API token',Icon:DatabaseBackup},{name:'Encryption and database export',detail:'Install pg_dump 18 in the GitHub Actions runner and keep AES-256 key private',Icon:ShieldCheck},{name:'Daily scheduler',detail:'Included GitHub Actions workflow runs daily when enabled',Icon:Clock3}].map(({name,detail,Icon})=><div className="flex gap-3" key={name}><span className="workspace-action__icon"><Icon size={19}/></span><div><strong className="text-sm">{name}</strong><p className="workspace-muted mt-1">{detail}</p></div></div>)}</div>{canBackups&&<Link href="/admin/maintenance/settings?tab=backups" className="workspace-action mt-5"><span className="flex-1"><strong>Open R2 Backup Center</strong><small>Queue a backup or check missing GitHub runner configuration</small></span><ArrowRight size={17} className="workspace-action__arrow"/></Link>}</section>
        <div className="workspace-banner workspace-banner--warning"><AlertTriangle size={18} className="shrink-0"/><span>Enabling this setting alone does not create backups. Test a secure restore before relying on any backup process.</span></div>
      </aside>
    </div>}
  </main>;
}
