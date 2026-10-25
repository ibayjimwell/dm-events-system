import {permissionSet,pagePermission} from '@/lib/access';
import Overview from '@/components/admin/Overview';export default async function Page(){const user=await pagePermission('dashboard.admin');return <Overview permissions={[...await permissionSet(user)]}/>}
