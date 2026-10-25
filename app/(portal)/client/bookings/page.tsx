import {pagePermission} from '@/lib/access';
import BookingList from '@/components/client/BookingList';export default async function Page(){await pagePermission('bookings.view.own');return <BookingList/>}
