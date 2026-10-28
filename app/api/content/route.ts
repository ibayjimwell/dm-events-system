import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { siteContent, mediaAssets } from '@/db/schema';
import { actor, audit } from '@/lib/auth';
import { can, requirePermission } from '@/lib/access';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { currentSite } from '@/models/read';
import { normalizeHomepage } from '@/lib/sitePresentation';

const copy = (length = 600) => z.string().trim().min(2).max(length);
const block = z.object({ title: copy(120), description: copy(420) });
const homepageSchema = z.object({
  heroEyebrow: copy(100),
  aboutEyebrow: copy(100), aboutTitle: copy(180), aboutBody: copy(1000),
  featuresEyebrow: copy(100), featuresTitle: copy(180), features: z.tuple([block, block, block]),
  packagesEyebrow: copy(100), packagesTitle: copy(180), packagesBody: copy(700),
  stepsEyebrow: copy(100), stepsTitle: copy(180), steps: z.tuple([block, block, block]),
  ctaEyebrow: copy(100), ctaTitle: copy(180), ctaBody: copy(700),
});
const contentSchema = z.object({
  heroTitle: z.string().trim().min(3).max(180),
  heroSubtitle: z.string().trim().min(3).max(600),
  heroImageId: z.string().uuid().nullable().optional(),
  contactEmail: z.union([z.literal(''), z.string().trim().email().max(200)]),
  contactPhone: z.string().trim().max(80),
  privacyPolicy: z.string().min(100).max(20000),
  // Optional for backwards compatibility with older saved drafts and clients.
  homepage: homepageSchema.optional(),
});

export const GET = route(async () => {
  const content = await currentSite();
  if (!content) throw new HttpError(500, 'Site configuration missing');
  const user = await actor();
  const permitted = !!user && await can(user, 'content.manage');
  return ok({ content: {
    ...content,
    homepage: normalizeHomepage(content.homepage),
    draft: permitted ? content.draft : undefined,
  } });
});

export const PATCH = route(async req => {
  const user = await requirePermission('content.manage');
  const body = await readJson(req);
  const action = z.enum(['draft', 'publish']).parse(body.action);
  const values = contentSchema.parse(body.data);
  const [current] = await db.select().from(siteContent).where(eq(siteContent.id, 'main'));
  if (!current) throw new HttpError(404, 'Website content not found');

  if (values.heroImageId) {
    const [asset] = await db.select().from(mediaAssets).where(and(
      eq(mediaAssets.id, values.heroImageId), eq(mediaAssets.kind, 'HERO'),
      eq(mediaAssets.deliveryType, 'upload'),
    ));
    if (!asset) throw new HttpError(400, 'Choose a valid publicly deliverable homepage image');
  }
  const published = {
    ...values,
    heroImageId: values.heroImageId || null,
    homepage: homepageSchema.parse(values.homepage ?? normalizeHomepage(current.homepage)),
  };
  if (action === 'draft') {
    await db.update(siteContent).set({ draft: published, updatedAt: new Date() }).where(eq(siteContent.id, 'main'));
  } else {
    await db.update(siteContent).set({ ...published, draft: null, updatedAt: new Date() }).where(eq(siteContent.id, 'main'));
    revalidatePath('/');
    revalidatePath('/packages');
    revalidatePath('/privacy');
  }
  await audit(user.id, action === 'draft' ? 'CONTENT_DRAFT_SAVED' : 'CONTENT_PUBLISHED', 'content', 'main');
  return ok({ success: true });
});
