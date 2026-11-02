import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { actor } from '@/lib/auth';
import { portalHome } from '@/lib/portalHome';
import AuthForms from '@/components/client/AuthForms';
import { safeBookingDestination } from '@/lib/bookingNavigation';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }){
  const requested = safeBookingDestination((await searchParams).next);
  const user=await actor();
  if (user) {
    const home = await portalHome(user);
    redirect(user.role === 'CLIENT' && home === '/client' ? (requested ?? home) : home);
  }
  return <Suspense><AuthForms mode="login"/></Suspense>;
}
