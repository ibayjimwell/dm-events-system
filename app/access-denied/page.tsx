import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { actor } from '@/lib/auth';
import { portalHome } from '@/lib/portalHome';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Access Denied | DM Events' };

/**
 * This route deliberately sits directly under app/, outside the (public) and
 * (portal) route groups. Only the minimal root layout wraps this screen, so
 * neither the public navbar/footer nor the portal shell can appear here.
 * The destination is a real page the signed-in user can access, or the
 * waiting-for-access page when no modules have been assigned.
 */
export default async function AccessDeniedPage() {
  const user = await actor();
  if (!user) redirect('/login');

  const home = await portalHome(user);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 py-12">
      <section
        role="alert"
        aria-labelledby="access-denied-title"
        className="w-full max-w-md rounded-2xl border border-[#dae4ed] bg-white px-6 py-10 text-center shadow-sm sm:px-10"
      >
        <h1 id="access-denied-title" className="text-3xl font-bold text-[#122c44]">
          Access Denied
        </h1>
        <p className="mt-3 text-base text-[#536c83]">
          You don&apos;t have access to this section.
        </p>
        <Link
          href={home}
          className="btn mt-7 inline-flex min-h-11 items-center justify-center gap-2"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Back
        </Link>
      </section>
    </main>
  );
}
