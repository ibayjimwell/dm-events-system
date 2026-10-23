import BookingDetail from '@/components/client/BookingDetail';export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <BookingDetail id={id}/>}
