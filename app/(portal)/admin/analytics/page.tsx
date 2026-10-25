import {pagePermission,can} from '@/lib/access';
import Analytics from '@/components/admin/Analytics';export default async function Page(){const user=await pagePermission('analytics.view');return <Analytics canExport={await can(user,'analytics.export')}/>}
