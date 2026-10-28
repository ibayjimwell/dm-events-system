import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Check, MessageCircle, Sparkles } from 'lucide-react';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { packages } from '@/db/schema';

export const dynamic = 'force-dynamic';
export default async function PackagePage({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const [pkg] = await db.select().from(packages).where(and(eq(packages.id, id), eq(packages.published, true)));
  if (!pkg) notFound();
  return <main className="dm-marketing dm-package-detail">
    <div className="dm-marketing__container"><nav className="dm-package-detail__breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/packages">Packages</Link><span>/</span><span aria-current="page">{pkg.name}</span></nav>
      <section className="dm-package-detail__layout">
        <div className="dm-package-detail__left">
          <div className="dm-package-detail__image">{pkg.imageId ? <img src={`/api/assets/${pkg.imageId}`} alt={`${pkg.name} event package`} /> : <span className="dm-package-detail__placeholder"><Sparkles size={56} strokeWidth={1} /> DM EVENTS</span>}<span className="dm-package-detail__image-badge">EVENT PACKAGE</span></div>
          <div className="dm-package-detail__description"><p className="dm-eyebrow"><span className="dm-line" />THE EXPERIENCE</p><h2>About this package</h2><p>{pkg.description}</p></div>
          <div className="dm-package-detail__inclusions"><h2>What's included</h2>{pkg.inclusions.length ? <ul>{pkg.inclusions.map((value,i)=><li key={i}><span><Check size={16} /></span>{value}</li>)}</ul> : <p>Contact our team for the current inclusions and available options.</p>}</div>
        </div>
        <aside className="dm-package-detail__aside"><div className="dm-package-detail__booking-card"><p className="dm-eyebrow"><span className="dm-line" />PLAN YOUR OCCASION</p><h1>{pkg.name}</h1><p className="dm-package-detail__helper">Every celebration is unique. Share your date and plans, and our team can discuss availability and a quotation with you.</p><div className="dm-package-detail__facts"><span><CalendarDays size={18}/> Date subject to availability</span><span><MessageCircle size={18}/> Personalized quotation</span></div><Link href={`/client/book?package=${encodeURIComponent(pkg.id)}`} className="dm-button dm-button--dark">Request this package <ArrowRight size={18}/></Link><p className="dm-package-detail__disclaimer">Sending a request does not hold or confirm your event date.</p></div><Link className="dm-back-link" href="/packages"><ArrowLeft size={17}/> See all packages</Link></aside>
      </section>
    </div>
  </main>;
}
