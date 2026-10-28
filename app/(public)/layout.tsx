export const dynamic = 'force-dynamic';
import SiteNav from '@/components/shared/SiteNav';
import Footer from '@/components/shared/Footer';
import { actor } from '@/lib/auth';
import { currentSite } from '@/models/read';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [user, site] = await Promise.all([actor(), currentSite()]);
  return (
    <>
      <SiteNav role="PUBLIC" signedIn={!!user} signedInRole={user?.role} />
      {children}
      <Footer contact={site} />
    </>
  );
}
