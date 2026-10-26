import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { actor } from '@/lib/auth';
import AuthForms from '@/components/client/AuthForms';
export const dynamic = 'force-dynamic';
export default async function Page(){
  const user=await actor();
  if(user?.role==='ADMIN')redirect('/admin');
  if(user?.role==='COORDINATOR')redirect('/coordinator');
  if(user?.role==='CLIENT')redirect('/client');
  return <Suspense><AuthForms mode="login"/></Suspense>;
}
