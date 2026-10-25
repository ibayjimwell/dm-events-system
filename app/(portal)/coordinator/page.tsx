import {permissionSet,pagePermission} from '@/lib/access';
import Dashboard from '@/components/shared/Dashboard';export default async function Page(){const user=await pagePermission('dashboard.coordinator');return <Dashboard permissions={[...await permissionSet(user)]} role="COORDINATOR"/>}
