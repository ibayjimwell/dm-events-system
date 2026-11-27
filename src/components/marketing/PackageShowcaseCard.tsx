import Link from 'next/link';
import PackageImageCarousel from '@/components/ui/PackageImageCarousel';
import { loginForBooking } from '@/lib/bookingNavigation';
import { ArrowUpRight, Check, Image as ImageIcon } from 'lucide-react';

export type PublicPackage = {
  id: string;
  name: string;
  description: string;
  inclusions: string[];
  imageId: string | null;
  imageIds?: string[];
};

export default function PackageShowcaseCard({ item, index = 0, requestHref }: { item: PublicPackage; index?: number; requestHref?: string | null }) {
  return (
    <article className="dm-showcase-card">
      <div className="dm-showcase-card__image">
        <PackageImageCarousel imageIds={item.imageIds} imageId={item.imageId} alt={item.name} placeholder={<ImageIcon size={38} strokeWidth={1.2} aria-hidden="true"/>} />
        <span className="dm-showcase-card__counter">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="dm-showcase-card__body">
        <p className="dm-mini-label">EVENT PACKAGE</p>
        <h3>{item.name}</h3>
        <p className="dm-showcase-card__description">{item.description}</p>
        {item.inclusions.length > 0 && (
          <ul className="dm-inclusion-list">
            {item.inclusions.slice(0, 3).map((inclusion, i) => <li key={`${inclusion}-${i}`}><Check size={15} aria-hidden="true"/><span>{inclusion}</span></li>)}
          </ul>
        )}
        <div className="dm-showcase-card__actions">
          <Link href={`/packages/${item.id}`} className="dm-showcase-card__link">Explore package <ArrowUpRight size={18} aria-hidden="true" /></Link>
          {requestHref !== null && <Link href={requestHref ?? loginForBooking(item.id)} className="dm-showcase-card__request">Choose this package <ArrowUpRight size={17} aria-hidden="true" /></Link>}
        </div>
      </div>
    </article>
  );
}
