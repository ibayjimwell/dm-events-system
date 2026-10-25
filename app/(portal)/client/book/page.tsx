import {pagePermission} from '@/lib/access';
import {Suspense} from 'react';import BookingWizard from '@/components/client/BookingWizard';
export default async function Page(){await pagePermission('bookings.create.own');return <Suspense><BookingWizard/></Suspense>}
