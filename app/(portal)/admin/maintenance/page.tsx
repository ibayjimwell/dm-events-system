import Link from 'next/link';
import { notFound } from 'next/navigation';
import { actor } from '@/lib/auth';
import { permissionSet } from '@/lib/access';
import { Boxes, Globe, Users, Settings, Database, BellRing, ArrowUpRight, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { Permission } from '@/lib/permissions';

const modules = [
  { title:'Event packages',detail:'Curate, organize and publish the packages clients can explore.',href:'/admin/maintenance/packages',permission:'packages.manage',Icon:Boxes,category:'CLIENT EXPERIENCE' },
  { title:'Website content',detail:'Edit your homepage, published details and privacy information.',href:'/admin/maintenance/content',permission:'content.manage',Icon:Globe,category:'CLIENT EXPERIENCE' },
  { title:'Accounts & permissions',detail:'Manage staff access, account status and module-level authorization.',href:'/admin/maintenance/users',permission:'users.manage',Icon:Users,category:'PEOPLE & ACCESS' },
  { title:'Cloudflare R2 backups',detail:'Queue an encrypted database backup, check GitHub runner configuration, and inspect backup history.',href:'/admin/maintenance/backups',permission:'backups.manage',Icon:Database,category:'SYSTEM OPERATIONS' },
  { title:'System settings',detail:'Control backup policy and operational configuration.',href:'/admin/maintenance/settings',permission:'settings.manage',Icon:Settings,category:'SYSTEM OPERATIONS' },
  { title:'Email & SMS delivery',detail:'Check notification delivery, retry failures, and test email connectivity.',href:'/admin/maintenance/notifications',permission:'settings.manage',Icon:BellRing,category:'SYSTEM OPERATIONS' },
] as const;

export default async function Maintenance() {
  const user = await actor();
  if (!user) notFound();
  const allowed = await permissionSet(user);
  const visible = modules.filter(module=>allowed.has(module.permission as Permission));
  if (!visible.length) notFound();
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><SlidersHorizontal size={15}/> ADMINISTRATION STUDIO</span><h1>Manage your business workspace</h1><p>Keep your public website, packages, people, notifications and operational tools up to date—all in one place.</p></div></div></section>
    <div className="workspace-banner workspace-section"><ShieldCheck size={18} className="shrink-0"/><span>Only modules granted to your account are shown. Every update is also checked on the server.</span></div>
    {allowed.has('backups.manage') && (
      <section className="workspace-section rounded-2xl border border-[#c8ddf0] bg-gradient-to-r from-[#ebf5ff] to-white p-5 shadow-sm sm:p-6" aria-label="Cloudflare R2 backup quick access">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b4d98] text-white"><Database size={22}/></span><div><span className="text-[11px] font-extrabold tracking-[.1em] text-[#2d6697]">BACKUP CENTER</span><h2 className="mt-1 text-xl font-extrabold text-[#123a59]">Cloudflare R2 database backups</h2><p className="mt-1 text-sm leading-6 text-[#55738c]">Open the backup screen to queue a secure backup or find out which GitHub credentials still need configuring.</p></div></div>
          <Link href="/admin/maintenance/backups" className="btn shrink-0"><Database size={17}/> Open R2 Backup Center <ArrowUpRight size={16}/></Link>
        </div>
      </section>
    )}
    {(['CLIENT EXPERIENCE','PEOPLE & ACCESS','SYSTEM OPERATIONS'] as const).map(category=>{
      const entries=visible.filter(module=>module.category===category);
      return entries.length?<section key={category} className="workspace-section"><div className="workspace-section__heading"><div><span className="workspace-kicker" style={{color:'#397ba3'}}>{category}</span><h2 className="mt-2">{category==='CLIENT EXPERIENCE'?'Public presentation':category==='PEOPLE & ACCESS'?'Team and permissions':'Secure operations'}</h2></div><span className="workspace-pill">{entries.length} module{entries.length===1?'':'s'}</span></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{entries.map(({title,detail,href,Icon})=><Link key={href} href={href} className="workspace-action !items-start !p-5"><span className="workspace-action__icon !h-12 !w-12"><Icon size={22}/></span><span className="flex-1"><strong className="!text-[15px]">{title}</strong><small className="mt-2 !text-xs">{detail}</small><span className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#0b4d98]">Open module <ArrowUpRight size={15}/></span></span></Link>)}</div>
      </section>:null;
    })}
  </main>;
}
