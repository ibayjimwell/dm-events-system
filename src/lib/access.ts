import { cache } from 'react';
import { db } from '@/db';
import { userModulePermissions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireActor, type Actor } from '@/lib/auth';
import { HttpError } from '@/lib/http';
import {
  ADMIN_ONLY,
  CLIENT_IDENTITY_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  defaultAccess,
  isPermission,
  type Permission,
} from '@/lib/permissions';

// React cache is scoped to one server render/request, never shared across users.
const coordinatorOverrides = cache(async (userId: string) => db.select({
  permission: userModulePermissions.permission,
  allowed: userModulePermissions.allowed,
}).from(userModulePermissions).where(eq(userModulePermissions.userId, userId)));

/**
 * Compute all effective permissions for navigation and other server-rendered UI.
 * ADMIN has all permissions, CLIENT permissions are fixed by role, and only
 * COORDINATOR accounts have individual grants/denials.
 */
export async function permissionSet(user: Actor): Promise<Set<Permission>> {
  if (user.role === 'ADMIN') {
    return new Set(PERMISSION_KEYS);
  }

  // Clients are not employees and must never inherit individual overrides.
  if (user.role === 'CLIENT') {
    return new Set(DEFAULT_PERMISSIONS.CLIENT);
  }

  // TypeScript correctly narrows user.role to COORDINATOR from this point.
  const effective = new Set<Permission>(DEFAULT_PERMISSIONS.COORDINATOR);
  const overrides = await coordinatorOverrides(user.id);

  for (const grant of overrides) {
    if (
      !isPermission(grant.permission) ||
      ADMIN_ONLY.has(grant.permission) ||
      CLIENT_IDENTITY_PERMISSIONS.has(grant.permission)
    ) {
      continue;
    }

    if (grant.allowed) {
      effective.add(grant.permission);
    } else {
      effective.delete(grant.permission);
    }
  }

  return effective;
}

/**
 * Check a capability at the server boundary. Do not rely on hidden UI links
 * for security; pages and API handlers must call this separately.
 */
export async function can(user: Actor, permission: Permission): Promise<boolean> {
  if (user.role === 'ADMIN') {
    return true;
  }

  if (user.role === 'CLIENT') {
    return defaultAccess('CLIENT', permission);
  }

  // Remaining users are COORDINATOR accounts. They cannot obtain
  // administrator-only permission management or client-identity modules.
  if (ADMIN_ONLY.has(permission) || CLIENT_IDENTITY_PERMISSIONS.has(permission)) {
    return false;
  }

  const overrides = await coordinatorOverrides(user.id);
  const override = overrides.find(row => row.permission === permission);
  return override?.allowed ?? defaultAccess(user.role, permission);
}

export async function requirePermission(permission: Permission): Promise<Actor> {
  const user = await requireActor();
  if (!(await can(user, permission))) {
    throw new HttpError(403, `Permission required: ${permission}`);
  }
  return user;
}

/** Server page boundary; APIs must also enforce permissions independently. */
export async function pagePermission(permission: Permission): Promise<Actor> {
  const user = await requireActor();
  if (!(await can(user, permission))) {
    notFound();
  }
  return user;
}
