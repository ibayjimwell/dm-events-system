import Link from 'next/link';
import { loginForBooking } from '@/lib/bookingNavigation';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { db } from '@/db';
import { packages } from '@/db/schema';
import PackageShowcaseCard from '@/components/marketing/PackageShowcaseCard';
import { currentSite } from '@/models/read';
import { normalizeHomepage } from '@/lib/sitePresentation';

export const dynamic = 'force-dynamic';
export default async function Packages() {
  const [data, site] = await Promise.all([
    db.select().from(packages).where(eq(packages.published, true)).orderBy(asc(packages.sortOrder), asc(packages.name)),
    currentSite(),
  ]);
  const homepage = normalizeHomepage(site?.homepage);
  return <main className="dm-marketing dm-catalog">
    <header className="dm-catalog__header"><div className="dm-marketing__container"><Link className="dm-back-link" href="/"><ArrowLeft size={16} /> Back to home</Link><p className="dm-eyebrow dm-eyebrow--light"><span className="dm-line" />{homepage.packagesEyebrow}</p><h1>{homepage.packagesTitle}</h1><p>{homepage.packagesBody}</p></div></header>
    <section className="dm-marketing__container dm-catalog__content" aria-label="Available event packages">
      <div className="dm-catalog__summary"><div><span>EXPLORE THE COLLECTION</span><h2>Event packages</h2></div><p>{data.length} {data.length === 1 ? 'package' : 'packages'} available to explore</p></div>
      {data.length ? <div className="dm-showcase-grid">{data.map((item,i)=><PackageShowcaseCard key={item.id} item={item} index={i} />)}</div> : <div className="dm-empty-packages"><Sparkles size={32} /><h3>Packages are coming soon</h3><p>Our offerings are being prepared. You can still request a personalized event consultation.</p><Link className="dm-button dm-button--dark" href={loginForBooking()}>Tell us about your event <ArrowRight size={17} /></Link></div>}
    </section>
    <div className="dm-marketing__container dm-catalog__foot"><p>Dates and final quotations are confirmed individually by DM Events. A request does not reserve a date.</p><Link href={loginForBooking()} className="dm-text-link">Have something else in mind? <ArrowRight size={17} /></Link></div>
  </main>;
}
