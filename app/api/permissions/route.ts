import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { users, userModulePermissions } from '@/db/schema';
import { audit } from '@/lib/auth';
import { requirePermission } from '@/lib/access';
import { route, ok, readJson, HttpError } from '@/lib/http';
import {
  MODULES,
  ADMIN_ONLY,
  CLIENT_IDENTITY_PERMISSIONS,
  isPermission,
  defaultAccess,
} from '@/lib/permissions';

/**
 * Read a staff member's effective permissions. Clients have fixed permissions
 * and are intentionally excluded from module management.
 */
export const GET = route(async (req) => {
  await requirePermission('users.manage');

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId || !z.string().uuid().safeParse(userId).success) {
    throw new HttpError(400, 'Valid userId required');
  }

  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new HttpError(404, 'Account not found');
  }
  if (user.role === 'CLIENT') {
    throw new HttpError(
      403,
      'Client accounts have fixed permissions. Select a Coordinator or Administrator.',
    );
  }

  const overrides = await db
    .select()
    .from(userModulePermissions)
    .where(eq(userModulePermissions.userId, user.id));

  const overrideMap = new Map(
    overrides.map((override) => [override.permission, override.allowed]),
  );

  return ok({
    user,
    modules: MODULES.map((module) => {
      const adminOnly = ADMIN_ONLY.has(module.key);
      const clientOnly = CLIENT_IDENTITY_PERMISSIONS.has(module.key);
      const inherited = defaultAccess(user.role, module.key);
      const storedOverride = overrideMap.get(module.key);

      return {
        ...module,
        adminOnly,
        clientOnly,
        inherited,
        override: overrideMap.has(module.key)
          ? storedOverride
            ? 'ALLOW'
            : 'DENY'
          : 'INHERIT',
        // Admin is granted all capabilities by role. Staff cannot use
        // personal-client or administrator-only capabilities.
        effective:
          user.role === 'ADMIN' ||
          (!adminOnly &&
            !clientOnly &&
            (storedOverride ?? inherited)),
      };
    }),
  });
});

/** Administrator-only endpoint for an employee's permission overrides. */
export const PATCH = route(async (req) => {
  const admin = await requirePermission('users.manage');
  const input = z
    .object({
      userId: z.string().uuid(),
      permission: z.string(),
      override: z.enum(['ALLOW', 'DENY', 'INHERIT']),
    })
    .parse(await readJson(req));

  if (!isPermission(input.permission)) {
    throw new HttpError(400, 'Unknown module permission');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId));

  if (!user) {
    throw new HttpError(404, 'Account not found');
  }
  if (user.role === 'CLIENT') {
    throw new HttpError(403, 'Client permissions are fixed and cannot be overridden');
  }
  if (user.role === 'ADMIN') {
    throw new HttpError(400, 'Administrator permissions are managed by role, not overrides');
  }

  // The previous role checks narrow user.role to COORDINATOR. Comparing it
  // again with CLIENT causes TS2367 and is not needed.
  if (CLIENT_IDENTITY_PERMISSIONS.has(input.permission)) {
    throw new HttpError(
      400,
      'Personal-client modules cannot be assigned to staff. Use the walk-in booking module.',
    );
  }
  if (ADMIN_ONLY.has(input.permission)) {
    throw new HttpError(403, 'Only Administrators can manage accounts and permissions');
  }

  if (input.override === 'INHERIT') {
    await db
      .delete(userModulePermissions)
      .where(
        and(
          eq(userModulePermissions.userId, user.id),
          eq(userModulePermissions.permission, input.permission),
        ),
      );
  } else {
    await db
      .insert(userModulePermissions)
      .values({
        userId: user.id,
        permission: input.permission,
        allowed: input.override === 'ALLOW',
        grantedBy: admin.id,
      })
      .onConflictDoUpdate({
        target: [userModulePermissions.userId, userModulePermissions.permission],
        set: {
          allowed: input.override === 'ALLOW',
          grantedBy: admin.id,
          updatedAt: new Date(),
        },
      });
  }

  await audit(admin.id, 'MODULE_PERMISSION_CHANGED', 'user', user.id, {
    permission: input.permission,
    override: input.override,
  });

  return ok({ success: true });
});
