import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { packages } from '@/db/schema';
import { isValidBookingPackageId } from '@/lib/bookingNavigation';

/** A preselected public package is verified before rendering the date step. */
export async function publishedRequestedPackageId(rawId: unknown): Promise<string | undefined> {
  if (!isValidBookingPackageId(rawId)) return undefined;
  const [pkg] = await db.select({ id: packages.id }).from(packages)
    .where(and(eq(packages.id, rawId), eq(packages.published, true))).limit(1);
  return pkg?.id;
}
