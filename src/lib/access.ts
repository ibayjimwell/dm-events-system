import { cache } from 'react';
import { db } from '@/db';
import { userModulePermissions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { requireActor, type Actor } from '@/lib/auth';
import { HttpError } from '@/lib/http';
import { canAssignPermission, isPermission, PERMISSION_KEYS, type Permission } from '@/lib/permissions';

// React cache is scoped to one server render/request; never shared across users.
const userGrants = cache(async (userId: string) => db.select({
  permission: userModulePermissions.permission,
  allowed: userModulePermissions.allowed,
}).from(userModulePermissions).where(eq(userModulePermissions.userId, userId)));

export async function permissionSet(user: Actor): Promise<Set<Permission>> {
  if (user.role === 'ADMIN' && user.isRootAdmin) return new Set(PERMISSION_KEYS);
  const effective = new Set<Permission>();
  for (const row of await userGrants(user.id)) {
    if (!isPermission(row.permission) || !canAssignPermission(user.role, row.permission)) continue;
    if (row.allowed) effective.add(row.permission);
    else effective.delete(row.permission);
  }
  return effective;
}

/** Every page and API must use these server-side checks; UI visibility is not security. */
export async function can(user: Actor, permission: Permission): Promise<boolean> {
  if (user.role === 'ADMIN' && user.isRootAdmin) return true;
  if (!canAssignPermission(user.role, permission)) return false;
  return (await userGrants(user.id)).some(row => row.permission === permission && row.allowed);
}

export async function requirePermission(permission: Permission): Promise<Actor> {
  const user = await requireActor();
  if (!(await can(user, permission))) throw new HttpError(403, `Permission required: ${permission}`);
  return user;
}

export async function pagePermission(permission: Permission): Promise<Actor> {
  const user = await requireActor();
  // A missing grant is a forbidden section, not a non-existent page.
  if (!(await can(user, permission))) redirect('/access-denied');
  return user;
}
