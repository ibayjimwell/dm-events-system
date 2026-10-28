import { requirePermission } from '@/lib/access';
import { route, ok } from '@/lib/http';
import { db } from '@/db';
import { users } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';

/** Staff directory for assigning event leads; no personal contact information exposed. */
export const GET = route(async () => {
  await requirePermission('bookings.review');
  const coordinators = await db.select({ id: users.id, name: users.fullName })
    .from(users).where(and(eq(users.role, 'COORDINATOR'), eq(users.isActive, true)))
    .orderBy(asc(users.fullName));
  return ok({ coordinators });
});
