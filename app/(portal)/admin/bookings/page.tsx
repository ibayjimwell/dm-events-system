import {pagePermission} from '@/lib/access';
import RequestList from '@/components/coordinator/RequestList';export default async function Page(){await pagePermission('bookings.view.all');return <RequestList role="ADMIN"/>}
