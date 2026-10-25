import {can,pagePermission} from '@/lib/access';
import BackupSettings from '@/components/admin/BackupSettings';export default async function Page(){const user=await pagePermission('settings.manage');return <BackupSettings canBackups={await can(user,'backups.manage')}/>}
