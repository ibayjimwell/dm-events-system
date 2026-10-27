import { api, json } from '@/api-client/http';
import { beginApiRequest } from '@/lib/api-activity';
type DirectKind = 'INSPIRATION'|'PACKAGE';
const TEN_MB = 10 * 1024 * 1024;

export type UploadedImage = { id: string; name: string; storedName: string; url: string };

/** Signed direct-to-Cloudinary transfer avoids Vercel's request-body limit. */
export async function uploadImage(file: File, kind: DirectKind): Promise<UploadedImage> {
  if(!file.size || file.size>TEN_MB) throw new Error('Maximum image size is 10 MB.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Only JPG, PNG and WebP images are supported.');
  const signed = await api<{
    cloudName:string;apiKey:string;signature:string;params:Record<string,string|number>;
    kind:DirectKind;publicId:string;expiresAt:number;ticket:string;
  }>('/api/uploads/sign',json('POST',{kind,fileName:file.name,size:file.size,mimeType:file.type}));
  const data = new FormData();
  data.set('file',file);
  data.set('api_key',signed.apiKey);
  data.set('signature',signed.signature);
  for(const [key,value] of Object.entries(signed.params))data.set(key,String(value));
  const endUpload = beginApiRequest();
  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`,{method:'POST',body:data});
  } finally {
    endUpload();
  }
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result?.error?.message||`Cloudinary upload failed (${response.status})`);
  if(result.public_id!==signed.publicId)throw new Error('Uploaded image identity mismatch');
  const finalized=await api<{asset:UploadedImage}>('/api/uploads/complete',json('POST',{
    kind, publicId:signed.publicId,expiresAt:signed.expiresAt,ticket:signed.ticket,originalName:file.name,
  }));
  return finalized.asset;
}
