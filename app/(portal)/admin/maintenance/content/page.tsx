import {pagePermission} from '@/lib/access';
import ContentEditor from '@/components/admin/ContentEditor';export default async function Page(){await pagePermission('content.manage');return <ContentEditor/>}
