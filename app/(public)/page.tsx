import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { packages } from '@/db/schema';
import { actor } from '@/lib/auth';
import { currentSite } from '@/models/read';
import HomeShowcase from '@/components/marketing/HomeShowcase';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await actor();
  if (user?.role === 'ADMIN') redirect('/admin');
  if (user?.role === 'COORDINATOR') redirect('/coordinator');
  if (!user && (await cookies()).get('dm_staff_portal')?.value === '1') redirect('/login');

  const [site, featured] = await Promise.all([
    currentSite(),
    db.select({ id: packages.id, name: packages.name, description: packages.description, inclusions: packages.inclusions, imageId: packages.imageId })
      .from(packages).where(eq(packages.published, true)).orderBy(asc(packages.sortOrder), asc(packages.name)).limit(3),
  ]);
  return <HomeShowcase
    site={{
      heroTitle: site?.heroTitle ?? 'Your Vision. Our Celebration.',
      heroSubtitle: site?.heroSubtitle ?? 'Plan memorable events with DM Events — from your first idea to the confirmed date.',
      heroImageId: site?.heroImageId ?? null,
      homepage: site?.homepage,
      contactEmail: site?.contactEmail,
      contactPhone: site?.contactPhone,
    }}
    featured={featured}
  />;
}
