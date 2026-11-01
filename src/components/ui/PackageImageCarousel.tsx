'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images } from 'lucide-react';

/** Self-contained accessible carousel. Parent card links remain separate from its controls. */
export default function PackageImageCarousel({ imageIds, imageId, alt, className = '', placeholder }: {
  imageIds?: string[] | null;
  imageId?: string | null;
  alt: string;
  className?: string;
  placeholder?: React.ReactNode;
}) {
  const images = imageIds?.length ? imageIds : imageId ? [imageId] : [];
  const identity = images.join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [identity]);
  const safeIndex = index % Math.max(1, images.length);
  const navigate = (delta: number) => setIndex(i => (i + delta + images.length) % images.length);
  return <div className={`relative isolate h-full min-h-[150px] w-full overflow-hidden bg-[#173b58] ${className}`} aria-label={`${alt} gallery`}>
    {images.length ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/assets/${images[safeIndex]}`} alt={`${alt} — photo ${safeIndex + 1} of ${images.length}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover"/>
      {images.length > 1 && <>
        <button type="button" onClick={event => { event.stopPropagation(); navigate(-1); }} aria-label={`Previous photo of ${alt}`} className="absolute left-2 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow transition hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-white"><ChevronLeft size={18}/></button>
        <button type="button" onClick={event => { event.stopPropagation(); navigate(1); }} aria-label={`Next photo of ${alt}`} className="absolute right-2 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow transition hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-white"><ChevronRight size={18}/></button>
        <span aria-live="polite" className="absolute bottom-3 right-3 z-10 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white"><Images size={13} className="mr-1 inline"/>{safeIndex + 1} / {images.length}</span>
      </>}
    </> : <div className="flex h-full min-h-[150px] items-center justify-center text-[#ead2a3]">{placeholder ?? <Images size={38}/>}</div>}
  </div>;
}
