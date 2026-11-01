import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { mediaAssets } from '@/db/schema';
import { HttpError } from '@/lib/http';

/** No private/inspiration assets can appear in published package galleries. */
export async function validatePackageGallery(ids: string[]) {
  if (ids.length > 10 || new Set(ids).size !== ids.length) throw new HttpError(400, 'Choose up to 10 unique images.');
  if (!ids.length) return;
  const records = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind, deliveryType: mediaAssets.deliveryType })
    .from(mediaAssets).where(inArray(mediaAssets.id, ids));
  if (records.length !== ids.length || records.some(a => a.kind !== 'PACKAGE' || a.deliveryType !== 'upload')) {
    throw new HttpError(400, 'Gallery includes an invalid or private image.');
  }
}

export function canonicalPackageImages<T extends { imageIds: string[]; imageId?: string | null }>(input: T) {
  const ids = input.imageIds.length ? input.imageIds : input.imageId ? [input.imageId] : [];
  return { ...input, imageIds: ids, imageId: ids[0] ?? null };
}
