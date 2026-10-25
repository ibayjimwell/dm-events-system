import {redirect} from 'next/navigation';
import {actor} from '@/lib/auth';
import {permissionSet} from '@/lib/access';
import SiteNav from '@/components/shared/SiteNav';
import Footer from '@/components/shared/Footer';
export default async function ClientLayout({children}:{children:React.ReactNode}){
 const user=await actor();if(!user)redirect('/login');
 // Client self-service is intentionally scoped to the account owner.
 // Authorized staff use the dedicated Walk-in Booking module instead.
 if(user.role!=='CLIENT')redirect(user.role==='ADMIN'?'/admin':'/coordinator');
 const permissions=await permissionSet(user);
 return <><SiteNav role="CLIENT" permissions={[...permissions]}/>{children}<Footer label="CLIENT"/></>;
}
