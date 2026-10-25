import WalkInBooking from '@/components/shared/WalkInBooking';
import {pagePermission} from '@/lib/access';
export default async function Page(){await pagePermission('bookings.create.walkin');return <WalkInBooking role="COORDINATOR"/>;}
