import {pagePermission} from '@/lib/access';
import BookingDetail from '@/components/client/BookingDetail';export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;await pagePermission('bookings.view.own');return <BookingDetail id={id}/>}
