import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { requireActor, audit } from '@/lib/auth';
import { authorizeImageKind, directKinds, TEN_MB, permittedImageFormat } from '@/lib/uploadPolicy';
import { cloud } from '@/lib/cloudinary';
import { db } from '@/db';
import { mediaAssets } from '@/db/schema';

export const runtime = 'nodejs';
const input = z.object({
  kind: z.enum(directKinds),
  publicId: z.string().min(1).max(250),
  originalName: z.string().min(1).max(255),
  expiresAt: z.number().int(),
  ticket: z.string().regex(/^[a-f0-9]{64}$/),
});

export const POST = route(async req => {
  const user = await requireActor();
  const v = input.parse(await readJson(req));
  await authorizeImageKind(user, v.kind);
  if (v.expiresAt < Date.now() || v.expiresAt > Date.now()+16*60_000) throw new HttpError(400, 'Upload authorization expired. Choose the photo again.');
  const prefix=`dm-events/${v.kind.toLowerCase()}/${v.kind.toLowerCase()}_`;
  if (!v.publicId.startsWith(prefix) || !/^dm-events\/(inspiration|package)\/[a-z]+_[0-9a-f]{32}$/.test(v.publicId)) throw new HttpError(400,'Invalid Cloudinary image identifier');
  const secret=process.env.CLOUDINARY_API_SECRET;
  if(!secret)throw new HttpError(503,'Cloudinary unavailable');
  const calculated=createHmac('sha256',secret).update(`${user.id}|${v.kind}|${v.publicId}|${v.expiresAt}`).digest('hex');
  if(!timingSafeEqual(Buffer.from(calculated,'hex'),Buffer.from(v.ticket,'hex')))throw new HttpError(403,'Invalid upload receipt');
  const deliveryType=v.kind==='PACKAGE'?'upload':'authenticated';
  let image: {public_id:string;format:string;bytes:number;resource_type:string;type:string;created_at:string};
  try {
    image=await cloud().api.resource(v.publicId,{resource_type:'image',type:deliveryType});
  } catch(error) {
    console.error('Cloudinary verification unavailable',error);
    throw new HttpError(502,'Cannot verify Cloudinary upload; please try again');
  }
  if(image.public_id!==v.publicId||image.resource_type!=='image'||image.type!==deliveryType||!permittedImageFormat(image.format)||image.bytes<1||image.bytes>TEN_MB)
    throw new HttpError(400,'Uploaded image failed server validation (JPG, PNG, WebP, maximum 10 MB).');
  const uploadedAt=Date.parse(image.created_at);
  if(!Number.isFinite(uploadedAt)||uploadedAt < Date.now()-60*60_000)throw new HttpError(400,'Image is too old; choose it again');
  const format=image.format==='jpg'||image.format==='jpeg'?'jpg':image.format;
  const mime=format==='jpg'?'image/jpeg':`image/${format}`;
  const storedName=`${v.publicId.split('/').pop()}.${format}`;
  const asset=await db.transaction(async tx=>{
    // Prevent duplicate records on repeated browser callbacks.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${v.publicId}))`);
    const [existing]=await tx.select().from(mediaAssets).where(eq(mediaAssets.publicId,v.publicId)).limit(1);
    if(existing){if(existing.uploadedBy!==user.id||existing.kind!==v.kind)throw new HttpError(403,'Image belongs to another upload');return existing;}
    const [created]=await tx.insert(mediaAssets).values({uploadedBy:user.id,kind:v.kind,publicId:v.publicId,deliveryType,originalName:v.originalName,storedName,mimeType:mime,byteSize:image.bytes}).returning();
    return created;
  });
  await audit(user.id,'MEDIA_UPLOADED','media',asset.id,{kind:v.kind,bytes:asset.byteSize});
  return ok({asset:{id:asset.id,name:asset.originalName,storedName:asset.storedName,url:`/api/assets/${asset.id}`}},201);
});
