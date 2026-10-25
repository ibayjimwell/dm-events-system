import {requirePermission,can} from '@/lib/access';
import {route,ok,readJson,HttpError} from '@/lib/http';import {requireActor,audit} from '@/lib/auth';import {db} from '@/db';import {siteContent,mediaAssets} from '@/db/schema';import {eq,and} from 'drizzle-orm';import {currentSite} from '@/models/read';import {z} from 'zod';
const contentSchema=z.object({heroTitle:z.string().min(3).max(180),heroSubtitle:z.string().min(3).max(600),heroImageId:z.string().uuid().nullable().optional(),contactEmail:z.string().max(200),contactPhone:z.string().max(80),privacyPolicy:z.string().min(100).max(20000)});
export const GET=route(async()=>{const site=await currentSite();if(!site)throw new HttpError(500,'Site configuration missing');const u=await import('@/lib/auth').then(m=>m.actor());return ok({content:{...site,draft:(u&&await can(u,'content.manage'))?site.draft:undefined}});});
export const PATCH=route(async(req)=>{const u=await requirePermission('content.manage');const body=await readJson(req);const action=z.enum(['draft','publish']).parse(body.action);const values=contentSchema.parse(body.data);
 if(values.heroImageId){const [asset]=await db.select().from(mediaAssets).where(and(eq(mediaAssets.id,values.heroImageId),eq(mediaAssets.kind,'HERO')));if(!asset)throw new HttpError(400,'Invalid hero image');}
 if(action==='draft'){await db.update(siteContent).set({draft:values,updatedAt:new Date()}).where(eq(siteContent.id,'main'));}
 else{await db.update(siteContent).set({...values,heroImageId:values.heroImageId||null,draft:null,updatedAt:new Date()}).where(eq(siteContent.id,'main'));}
 await audit(u.id,action==='draft'?'CONTENT_DRAFT_SAVED':'CONTENT_PUBLISHED','content','main');return ok({success:true});});
