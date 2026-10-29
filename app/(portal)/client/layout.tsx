export const dynamic = 'force-dynamic';
import {redirect} from 'next/navigation';
import {actor} from '@/lib/auth';
import {permissionSet} from '@/lib/access';
import PortalMessengerFrame from '@/components/shared/PortalMessengerFrame';
export default async function ClientLayout({children}:{children:React.ReactNode}){
 const user=await actor();if(!user)redirect('/login');
 // Client self-service is intentionally scoped to the account owner.
 // Authorized staff use the dedicated Walk-in Booking module instead.
 if(user.role!=='CLIENT')redirect(user.role==='ADMIN'?'/admin':'/coordinator');
 const permissions=await permissionSet(user);
 return <PortalMessengerFrame role="CLIENT" permissions={[...permissions]} footerLabel="CLIENT">{children}</PortalMessengerFrame>;
}
