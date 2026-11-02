import { redirect } from 'next/navigation';
import { actor } from '@/lib/auth';
import { portalHome } from '@/lib/portalHome';
import { ShieldAlert } from 'lucide-react';
import LogoutButton from '@/components/shared/LogoutButton';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/** Safe authenticated landing page for users awaiting a Mother Admin grant. */
export default async function AccessPending() {
  const user = await actor();
  if (!user) redirect('/login');
  const destination = await portalHome(user);
  if (destination !== '/access-pending') redirect(destination);
  return (
    <main className="mx-auto flex min-h-[75vh] max-w-xl items-center px-5 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-5 text-[#0b4d98]" size={40} aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-[#122c44]">Waiting for module access</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Your account is active, but no portal module is available yet. The Mother Admin
          needs to grant access in User Access. Sign in again or refresh this page after access is assigned.
        </p>
        <p className="mt-3 text-sm font-medium text-slate-700">Signed in as {user.fullName}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link className="btn" href="/access-pending">Check again</Link>
          <LogoutButton />
        </div>
      </section>
    </main>
  );
}
