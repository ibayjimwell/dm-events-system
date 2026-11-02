import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { users, userModulePermissions } from '@/db/schema';
import { audit } from '@/lib/auth';
import { requirePermission } from '@/lib/access';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { MODULES, canAssignPermission, defaultAccess, isPermission } from '@/lib/permissions';

/** The Mother Admin can inspect effective module grants for every role. */
export const GET = route(async (req) => {
  await requirePermission('users.manage');
  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId || !z.string().uuid().safeParse(userId).success) throw new HttpError(400, 'Valid userId required');

  const [user] = await db.select({
    id: users.id, fullName: users.fullName, email: users.email,
    role: users.role, isRootAdmin: users.isRootAdmin,
  }).from(users).where(eq(users.id, userId));
  if (!user) throw new HttpError(404, 'Account not found');

  const overrides = await db.select({ permission:userModulePermissions.permission, allowed:userModulePermissions.allowed })
    .from(userModulePermissions).where(eq(userModulePermissions.userId, user.id));
  const overrideMap = new Map(overrides.map(row => [row.permission, row.allowed]));
  const mother = user.role === 'ADMIN' && user.isRootAdmin;
  return ok({
    user,
    modules: MODULES.map(module => {
      const assignable = canAssignPermission(user.role, module.key);
      const storedOverride = overrideMap.get(module.key);
      return {
        ...module,
        inherited: defaultAccess(user.role, module.key),
        assignable: assignable && !mother,
        clientOnly: !canAssignPermission('ADMIN', module.key) && module.key !== 'users.manage',
        adminOnly: module.key === 'users.manage',
        override: mother ? 'INHERIT' : overrideMap.has(module.key) ? (storedOverride ? 'ALLOW' : 'DENY') : 'INHERIT',
        effective: mother || (assignable && storedOverride === true),
      };
    }),
  });
});

/** Only the Mother Admin can change permissions. Nobody can grant root management. */
export const PATCH = route(async (req) => {
  const mother = await requirePermission('users.manage');
  const input = z.object({
    userId: z.string().uuid(), permission: z.string(), override: z.enum(['ALLOW', 'DENY', 'INHERIT']),
  }).parse(await readJson(req));
  if (!isPermission(input.permission)) throw new HttpError(400, 'Unknown module permission');

  const [user] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!user) throw new HttpError(404, 'Account not found');
  if (user.isRootAdmin) throw new HttpError(403, 'Mother Admin permissions cannot be changed');
  if (!canAssignPermission(user.role, input.permission)) {
    throw new HttpError(403, 'This module is not available for the selected role');
  }

  if (input.override === 'INHERIT') {
    await db.delete(userModulePermissions).where(and(
      eq(userModulePermissions.userId, user.id), eq(userModulePermissions.permission, input.permission),
    ));
  } else {
    await db.insert(userModulePermissions).values({
      userId: user.id, permission: input.permission,
      allowed: input.override === 'ALLOW', grantedBy: mother.id,
    }).onConflictDoUpdate({
      target: [userModulePermissions.userId, userModulePermissions.permission],
      set: { allowed:input.override === 'ALLOW', grantedBy:mother.id, updatedAt:new Date() },
    });
  }
  await audit(mother.id, 'MODULE_PERMISSION_CHANGED', 'user', user.id, {
    permission:input.permission, override:input.override, role:user.role,
  });
  return ok({ success:true });
});
