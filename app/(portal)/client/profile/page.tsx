import {pagePermission} from '@/lib/access';
import Profile from '@/components/client/Profile';export default async function Page(){await pagePermission('profile.edit');return <Profile/>}
