import {pagePermission} from '@/lib/access';
import PackageEditor from '@/components/admin/PackageEditor';export default async function Page(){await pagePermission('packages.manage');return <PackageEditor/>}
