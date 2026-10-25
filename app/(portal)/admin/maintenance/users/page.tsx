import {pagePermission} from '@/lib/access';
import UsersEditor from '@/components/admin/UsersEditor';export default async function Page(){await pagePermission('users.manage');return <UsersEditor/>}
