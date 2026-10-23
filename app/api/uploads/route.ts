
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

import { route, ok, HttpError } from '@/lib/http';
import { requireActor, audit } from '@/lib/auth';
import { db } from '@/db';
import { mediaAssets } from '@/db/schema';
import { sendToCloud } from '@/lib/cloudinary';

export const runtime = 'nodejs';

const uploadKinds = [
  'INSPIRATION',
  'MESSAGE',
  'PACKAGE',
  'HERO',
] as const;

type UploadKind = (typeof uploadKinds)[number];

export const POST = route(async (req) => {
  const user = await requireActor();

  if (
    !(req.headers.get('content-type') ?? '').includes(
      'multipart/form-data'
    )
  ) {
    throw new HttpError(
      415,
      'Multipart form required.'
    );
  }

  const form = await req.formData();

  const kindValue = form.get('kind');
  const file = form.get('image');

  if (
    typeof kindValue !== 'string' ||
    !uploadKinds.includes(kindValue as UploadKind)
  ) {
    throw new HttpError(400, 'Invalid upload type.');
  }

  const kind = kindValue as UploadKind;

  // Only administrators can manage public website images.
  if (
    (kind === 'PACKAGE' || kind === 'HERO') &&
    user.role !== 'ADMIN'
  ) {
    throw new HttpError(
      403,
      'Only administrators may upload website images.'
    );
  }

  if (!(file instanceof File)) {
    throw new HttpError(
      400,
      'Please choose an image.'
    );
  }

  // Client inspiration and message photos: 1 MB.
  // Package and hero photos: 5 MB.
  const maxBytes =
    kind === 'INSPIRATION' || kind === 'MESSAGE'
      ? 1024 * 1024
      : 5 * 1024 * 1024;

  if (file.size === 0 || file.size > maxBytes) {
    throw new HttpError(
      400,
      `The image must be 1 byte to ${
        maxBytes / (1024 * 1024)
      } MB in size.`
    );
  }

  const buffer = Buffer.from(
    await file.arrayBuffer()
  );

  let metadata: sharp.Metadata;

  try {
    metadata = await sharp(buffer, {
      limitInputPixels: 25_000_000,
      failOn: 'error',
    }).metadata();
  } catch {
    throw new HttpError(
      400,
      'The image is invalid or too large to process.'
    );
  }

  if (
    !metadata.format ||
    !['jpeg', 'png', 'webp'].includes(metadata.format)
  ) {
    throw new HttpError(
      400,
      'Only JPG, JPEG, PNG, and WebP images are accepted.'
    );
  }

  const extension =
    metadata.format === 'jpeg'
      ? 'jpg'
      : metadata.format;

  const mimeType =
    metadata.format === 'jpeg'
      ? 'image/jpeg'
      : `image/${extension}`;

  // Generated filename.
  const baseName = `${kind.toLowerCase()}_${randomUUID().replaceAll(
    '-',
    ''
  )}`;

  const storedName = `${baseName}.${extension}`;

  // Public website images can be delivered publicly.
  // Client inspiration and message images stay protected.
  const deliveryType =
    kind === 'PACKAGE' || kind === 'HERO'
      ? ('upload' as const)
      : ('authenticated' as const);

  // Upload to Cloudinary.
  const uploaded = await sendToCloud(
    buffer,
    `dm-events/${kind.toLowerCase()}`,
    baseName,
    deliveryType
  );

  // Record the Cloudinary asset in Supabase PostgreSQL.
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      uploadedBy: user.id,
      kind,
      publicId: uploaded.public_id,
      deliveryType,
      storedName,
      originalName: file.name.slice(0, 255),
      mimeType,
      byteSize: buffer.length,
    })
    .returning();

  // Write activity audit.
  await audit(
    user.id,
    'MEDIA_UPLOADED',
    'media',
    asset.id,
    {
      kind,
      mime: mimeType,
      bytes: buffer.length,
    }
  );

  return ok(
    {
      asset: {
        id: asset.id,
        name: asset.originalName,
        storedName: asset.storedName,
        url: `/api/assets/${asset.id}`,
      },
    },
    201
  );
});
