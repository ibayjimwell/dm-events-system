import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { actor } from '@/lib/auth';
import AuthForms from '@/components/client/AuthForms';
import { safeBookingDestination } from '@/lib/bookingNavigation';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }){
  const requested = safeBookingDestination((await searchParams).next);
  const user=await actor();
  if(user?.role==='ADMIN')redirect('/admin');
  if(user?.role==='COORDINATOR')redirect('/coordinator');
  if(user?.role==='CLIENT')redirect(requested ?? '/client');
  return <Suspense><AuthForms mode="login"/></Suspense>;
}
