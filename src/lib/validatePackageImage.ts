import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { mediaAssets } from '@/db/schema';
import { HttpError } from '@/lib/http';
/** Public package assets must be server-verified Cloudinary package images. */
export async function validatePackageImage(imageId: string | null | undefined, userId: string) {
  if(!imageId) return;
  const [asset]=await db.select().from(mediaAssets).where(eq(mediaAssets.id,imageId)).limit(1);
  if(!asset || asset.kind!=='PACKAGE' || asset.deliveryType!=='upload')throw new HttpError(400,'Choose a valid package image');
  // Previously linked images can be retained by another authorized package editor.
  // No cross-kind or authenticated private image may be published.
}
