import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react';
import PackageShowcaseCard, { type PublicPackage } from './PackageShowcaseCard';
import { normalizeHomepage } from '@/lib/sitePresentation';

export type HomepageSite = {
  heroTitle: string;
  heroSubtitle: string;
  heroImageId: string | null;
  homepage?: unknown;
  contactEmail?: string | null;
  contactPhone?: string | null;
};
const featureIcons = [Sparkles, CalendarDays, MessageCircle] as const;

export default function HomeShowcase({ site, featured, preview = false }: {
  site: HomepageSite;
  featured: PublicPackage[];
  preview?: boolean;
}) {
  const h = normalizeHomepage(site.homepage);
  return <main className={`dm-marketing ${preview ? 'dm-marketing--preview' : ''}`}>
    <section className="dm-hero" aria-labelledby="dm-hero-title">
      <div className="dm-hero__photo" style={{ backgroundImage: `url("${site.heroImageId ? `/api/assets/${site.heroImageId}` : '/images/venue.jpg'}")` }} aria-hidden="true" />
      <div className="dm-hero__veil" />
      <div className="dm-marketing__container dm-hero__content">
        <p className="dm-eyebrow dm-eyebrow--light"><span className="dm-line" />{h.heroEyebrow}</p>
        <h1 id="dm-hero-title">{site.heroTitle}</h1>
        <p className="dm-hero__subtitle">{site.heroSubtitle}</p>
        <div className="dm-hero__actions">
          <Link className="dm-button dm-button--gold" href="/packages">Explore our packages <ArrowUpRight size={18} aria-hidden="true" /></Link>
          <Link className="dm-button dm-button--outline" href="/client/book">Plan your event <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </div>
      <div className="dm-hero__bottom dm-marketing__container"><span>DM EVENTS · EVENT BOOKING & COORDINATION</span><a href="#discover" aria-label="Scroll to discover DM Events">DISCOVER <ArrowDown size={16} /></a></div>
    </section>

    <section id="discover" className="dm-introduction dm-marketing__container" aria-labelledby="dm-about-title">
      <div className="dm-introduction__aside"><p className="dm-eyebrow"><span className="dm-line" />{h.aboutEyebrow}</p><span className="dm-introduction__ornament" aria-hidden="true">✳</span></div>
      <div className="dm-introduction__main"><h2 id="dm-about-title">{h.aboutTitle}</h2><p>{h.aboutBody}</p><Link className="dm-text-link" href="/packages">Discover our packages <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
    </section>

    <section className="dm-features" aria-labelledby="dm-features-title"><div className="dm-marketing__container">
      <div className="dm-section-heading"><p className="dm-eyebrow"><span className="dm-line" />{h.featuresEyebrow}</p><h2 id="dm-features-title">{h.featuresTitle}</h2></div>
      <div className="dm-features__grid">{h.features.map((f, i) => { const Icon = featureIcons[i]; return <article className="dm-feature" key={i}><span className="dm-feature__icon"><Icon size={26} strokeWidth={1.5} aria-hidden="true" /></span><span className="dm-feature__number">0{i + 1}</span><h3>{f.title}</h3><p>{f.description}</p></article>; })}</div>
    </div></section>

    <section className="dm-featured dm-marketing__container" aria-labelledby="dm-featured-title">
      <div className="dm-featured__head"><div className="dm-section-heading"><p className="dm-eyebrow"><span className="dm-line" />{h.packagesEyebrow}</p><h2 id="dm-featured-title">{h.packagesTitle}</h2><p>{h.packagesBody}</p></div><Link className="dm-text-link" href="/packages">View all packages <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
      {featured.length ? <div className="dm-showcase-grid">{featured.slice(0,3).map((item,i)=><PackageShowcaseCard key={item.id} item={item} index={i} />)}</div> : <div className="dm-empty-packages"><Sparkles size={28} aria-hidden="true" /><h3>Something wonderful is taking shape.</h3><p>Our packages are being prepared. You can still share your event idea with us.</p><Link className="dm-button dm-button--dark" href="/client/book">Start an inquiry <ArrowRight size={16} /></Link></div>}
    </section>

    <section className="dm-journey" aria-labelledby="dm-journey-title"><div className="dm-marketing__container dm-journey__layout"><div><p className="dm-eyebrow dm-eyebrow--light"><span className="dm-line" />{h.stepsEyebrow}</p><h2 id="dm-journey-title">{h.stepsTitle}</h2><p className="dm-journey__note">Your event journey, organized from the beginning.</p></div><div className="dm-journey__steps">{h.steps.map((step,i)=><div className="dm-journey__step" key={i}><span className="dm-journey__index">0{i+1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div><CheckCircle2 size={19} aria-hidden="true" /></div>)}</div></div></section>

    <section className="dm-final-cta dm-marketing__container" aria-labelledby="dm-cta-title"><div className="dm-final-cta__inner"><div><p className="dm-eyebrow"><span className="dm-line" />{h.ctaEyebrow}</p><h2 id="dm-cta-title">{h.ctaTitle}</h2><p>{h.ctaBody}</p></div><Link className="dm-button dm-button--dark" href="/client/book">Request an event <ArrowUpRight size={18} aria-hidden="true" /></Link></div></section>
  </main>;
}
