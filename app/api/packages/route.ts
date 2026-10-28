import { revalidatePath } from 'next/cache';
import {validatePackageImage} from '@/lib/validatePackageImage';
import {requirePermission,can} from '@/lib/access';
import {route,ok,readJson} from '@/lib/http';import {db} from '@/db';import {packages} from '@/db/schema';import {eq,asc} from 'drizzle-orm';import {actor,requireActor,audit} from '@/lib/auth';import {packageInput} from '@/lib/validators';
export const GET=route(async()=>{const u=await actor();const all=await db.select().from(packages).where((u && await can(u,'packages.manage'))?undefined:eq(packages.published,true)).orderBy(asc(packages.sortOrder));return ok({packages:all});});
export const POST=route(async(req)=>{const u=await requirePermission('packages.manage');const v=packageInput.parse(await readJson(req));await validatePackageImage(v.imageId,u.id);const [p]=await db.insert(packages).values(v).returning();await audit(u.id,'PACKAGE_CREATED','package',p.id);revalidatePath('/');revalidatePath('/packages');return ok({package:p},201);});
