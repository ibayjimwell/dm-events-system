'use client';

import { useState } from 'react';
import { Database, DatabaseBackup, RefreshCw, AlertTriangle, ShieldCheck, HardDriveDownload, ArchiveRestore } from 'lucide-react';
import { api } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';

type Backup={id:string;createdAt:string;status:string;sizeBytes:number|null;storageKey:string|null;error:string|null};

export default function Backups() {
  const {data,error,refresh,loading}=useLiveQuery(()=>api<{logs:Backup[];configured:boolean}>('/api/backups'),[],{cacheKey:'admin:/api/backups',realtimeKinds:['backup_logs']});
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[noticeError,setNoticeError]=useState(false);
  async function run() {
    if (!window.confirm('Create an encrypted backup of the current database and upload it to the configured off-site storage?')) return;
    setBusy(true);setNotice('');setNoticeError(false);
    try {await api('/api/backups',{method:'POST'});setNotice('An encrypted backup was created and uploaded successfully.');await refresh();}
    catch(cause){setNoticeError(true);setNotice(cause instanceof Error?cause.message:'Unable to create backup.');}
    finally{setBusy(false);}
  }
  const logs=data?.logs??[];
  const success=logs.filter(item=>['SUCCESS','COMPLETED','UPLOADED'].includes(item.status.toUpperCase())).length;
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><DatabaseBackup size={15}/> DATABASE SAFETY</span><h1>Backup & recovery history</h1><p>Monitor encrypted database snapshots and the status of your off-site backup destination.</p></div><div className="workspace-hero__actions"><button type="button" className="btn btn-outline" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/> Refresh history</button></div></div></section>
    {error&&<p role="alert" className="workspace-banner workspace-banner--error workspace-section">{error}</p>}
    <div className="workspace-metrics"><div className="workspace-metric"><div className="workspace-metric__icon"><Database size={20}/></div><div className="workspace-metric__label">Off-site destination</div><div className="mt-3"><span className={`workspace-pill ${data?.configured?'workspace-pill--good':'workspace-pill--warn'}`}>{data?.configured?'CONFIGURED':'NOT CONFIGURED'}</span></div><div className="workspace-metric__hint">S3-compatible encrypted storage</div></div><div className="workspace-metric"><div className="workspace-metric__icon"><HardDriveDownload size={20}/></div><div className="workspace-metric__label">Logged executions</div><div className="workspace-metric__value">{logs.length}</div><div className="workspace-metric__hint">Latest backup records</div></div><div className="workspace-metric"><div className="workspace-metric__icon"><ShieldCheck size={20}/></div><div className="workspace-metric__label">Completed entries</div><div className="workspace-metric__value">{success}</div><div className="workspace-metric__hint">Confirm file recoverability separately</div></div></div>
    <div className="workspace-grid workspace-section"><section className="workspace-card"><div className="workspace-section__heading"><div><h2>Backup history</h2><p>Recorded execution results and any storage failures.</p></div></div>
      {loading&&!data?<ListSkeleton label="Loading backup history" rows={4}/>:<><div className="workspace-table"><table><thead><tr><th>Created</th><th>Status</th><th>File size</th></tr></thead><tbody>{logs.map(item=><tr key={item.id}><td>{new Date(item.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}<div className="workspace-muted">{item.id}</div></td><td><span className={`workspace-pill ${['SUCCESS','COMPLETED','UPLOADED'].includes(item.status.toUpperCase())?'workspace-pill--good':['FAILED','ERROR'].includes(item.status.toUpperCase())?'workspace-pill--bad':'workspace-pill--warn'}`}>{item.status}</span>{item.error&&<p className="mt-2 break-words text-xs text-[#b33c4e]">{item.error}</p>}</td><td>{item.sizeBytes!=null?`${(item.sizeBytes/(1024*1024)).toFixed(2)} MB`:'—'}</td></tr>)}</tbody></table></div>{!logs.length&&<div className="workspace-empty mt-3"><DatabaseBackup size={25} className="mx-auto text-[#97aec2]"/><strong>No backup history</strong>Configure your destination before starting a backup.</div>}</>}
    </section><aside className="workspace-stack"><section className="workspace-card"><h3>Backup actions</h3><p className="workspace-muted">Back up the database to your configured encrypted storage destination.</p><button type="button" disabled={busy||!data?.configured} onClick={()=>void run()} className="btn mt-5 w-full"><DatabaseBackup size={17}/>{busy?'Creating backup…':'Create encrypted backup'}</button><button type="button" disabled={loading} onClick={()=>void refresh()} className="btn btn-ghost mt-3 w-full"><RefreshCw size={16}/> Refresh history</button>{notice&&<p role={noticeError?'alert':'status'} className={`workspace-banner mt-4 ${noticeError?'workspace-banner--error':'workspace-banner--success'}`}>{notice}</p>}</section><div className="workspace-banner workspace-banner--warning"><AlertTriangle size={18} className="shrink-0"/><span>Database snapshots do not include photos stored separately in Cloudinary.</span></div><div className="workspace-banner"><ArchiveRestore size={18} className="shrink-0"/><span>Restore runs only through the authorized <code>npm run restore</code> maintenance command with explicit confirmation. It is not available as a browser button.</span></div></aside></div>
  </main>;
}
