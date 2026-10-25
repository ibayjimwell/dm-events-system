import Link from 'next/link';
import {notFound} from 'next/navigation';
import {actor} from '@/lib/auth';
import {permissionSet} from '@/lib/access';
import {PageTitle,Panel} from '@/components/ui/Blocks';
import {Boxes,Globe,Users,Settings,Database} from 'lucide-react';
import type {Permission} from '@/lib/permissions';
const options=[
 {title:'Manage packages',detail:'Edit package details, images and visibility.',href:'/admin/maintenance/packages',permission:'packages.manage',Icon:Boxes},
 {title:'Website content',detail:'Update the homepage and privacy policy.',href:'/admin/maintenance/content',permission:'content.manage',Icon:Globe},
 {title:'User access & permissions',detail:'Manage staff accounts and module-level permissions.',href:'/admin/maintenance/users',permission:'users.manage',Icon:Users},
 {title:'Encrypted backups',detail:'Review backup history and create authorized encrypted backups.',href:'/admin/maintenance/backups',permission:'backups.manage',Icon:Database},
 {title:'System settings',detail:'Maintain system settings and backup policy.',href:'/admin/maintenance/settings',permission:'settings.manage',Icon:Settings},
] as const;
export default async function Maintenance(){
 const user=await actor();if(!user)notFound();const allowed=await permissionSet(user);
 const visible=options.filter(item=>allowed.has(item.permission as Permission));if(!visible.length)notFound();
 return <main className="page-wrap page-space min-w-0"><PageTitle title="Website maintenance" subtitle="Only authorized modules are listed. All actions are also checked by the server."/><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{visible.map(({title,detail,href,Icon})=><Panel key={href} className="flex min-w-0 flex-col gap-5"><div className="flex items-center gap-3"><Icon size={20} className="shrink-0 text-[#0b4d98]"/><h3 className="!m-0">{title}</h3></div><p className="hint">{detail}</p><Link href={href} className="btn mt-auto w-full sm:w-fit">Open module</Link></Panel>)}</div></main>;
}
