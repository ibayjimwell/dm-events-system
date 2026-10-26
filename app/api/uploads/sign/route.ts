import { randomUUID, createHmac } from 'node:crypto';
import { z } from 'zod';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { requireActor, checkAuthLimit } from '@/lib/auth';
import { cloud } from '@/lib/cloudinary';
import { TEN_MB, directKinds, imageMimeTypes, authorizeImageKind } from '@/lib/uploadPolicy';

export const runtime = 'nodejs';
const input = z.object({
  kind: z.enum(directKinds),
  fileName: z.string().min(1).max(255),
  size: z.number().int().min(1).max(TEN_MB),
  mimeType: z.enum(imageMimeTypes),
});

export const POST = route(async req => {
  const user = await requireActor();
  const v = input.parse(await readJson(req));
  await authorizeImageKind(user, v.kind);
  await checkAuthLimit('cloudinary-sign:' + user.id, 40);
  const provider = cloud();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = process.env.CLOUDINARY_API_KEY!;
  const secret = process.env.CLOUDINARY_API_SECRET!;
  if (!secret) throw new HttpError(503,'Cloudinary unavailable');
  const folder = `dm-events/${v.kind.toLowerCase()}`;
  const publicId = `${v.kind.toLowerCase()}_${randomUUID().replaceAll('-','')}`;
  const fullPublicId = `${folder}/${publicId}`;
  const timestamp = Math.floor(Date.now()/1000);
  const deliveryType = v.kind==='PACKAGE' ? 'upload' : 'authenticated';
  const params = {folder, public_id:publicId, timestamp, type:deliveryType, overwrite:'false', unique_filename:'false'};
  const signature = provider.utils.api_sign_request(params, secret);
  // A short-lived, user-bound receipt required before saving uploaded metadata.
  const expiresAt = Date.now() + 15*60_000;
  const ticket = createHmac('sha256', secret).update(`${user.id}|${v.kind}|${fullPublicId}|${expiresAt}`).digest('hex');
  return ok({cloudName, apiKey, signature, params, publicId:fullPublicId, kind:v.kind, expiresAt, ticket});
});
