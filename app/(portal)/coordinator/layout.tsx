export const dynamic = 'force-dynamic';
import {redirect} from 'next/navigation';
import {actor} from '@/lib/auth';
import {permissionSet} from '@/lib/access';
import PortalMessengerFrame from '@/components/shared/PortalMessengerFrame';
export default async function CoordinatorLayout({children}:{children:React.ReactNode}){
 const user=await actor();if(!user)redirect('/login');
 const permissions=await permissionSet(user);
 const ops=['dashboard.coordinator','calendar.view','bookings.view.all','bookings.create.walkin','messages.staff'] as const;
 if(!ops.some(p=>permissions.has(p)))redirect(user.role==='ADMIN'?'/admin':'/client');
 return <PortalMessengerFrame role={user.role} permissions={[...permissions]} footerLabel="OPERATIONS">{children}</PortalMessengerFrame>;
}
