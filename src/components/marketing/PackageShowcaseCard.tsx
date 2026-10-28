import Link from 'next/link';
import { ArrowUpRight, Check, Image as ImageIcon } from 'lucide-react';

export type PublicPackage = {
  id: string;
  name: string;
  description: string;
  inclusions: string[];
  imageId: string | null;
};

export default function PackageShowcaseCard({ item, index = 0 }: { item: PublicPackage; index?: number }) {
  return (
    <article className="dm-showcase-card">
      <Link className="dm-showcase-card__image" href={`/packages/${item.id}`} aria-label={`See ${item.name} package details`}>
        {item.imageId ? (
          // Same-party authenticated asset proxy authorizes published package images.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${item.imageId}`} alt={`${item.name} event package`} loading="lazy" />
        ) : (
          <span className={`dm-showcase-card__fallback dm-showcase-card__fallback--${index % 3}`}><ImageIcon size={38} strokeWidth={1.2} aria-hidden="true" /></span>
        )}
        <span className="dm-showcase-card__counter">{String(index + 1).padStart(2, '0')}</span>
      </Link>
      <div className="dm-showcase-card__body">
        <p className="dm-mini-label">EVENT PACKAGE</p>
        <h3>{item.name}</h3>
        <p className="dm-showcase-card__description">{item.description}</p>
        {item.inclusions.length > 0 && (
          <ul className="dm-inclusion-list">
            {item.inclusions.slice(0, 3).map((inclusion, i) => <li key={`${inclusion}-${i}`}><Check size={15} aria-hidden="true"/><span>{inclusion}</span></li>)}
          </ul>
        )}
        <Link href={`/packages/${item.id}`} className="dm-showcase-card__link">Explore package <ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
    </article>
  );
}
