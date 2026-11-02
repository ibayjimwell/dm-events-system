import { requirePermission } from '@/lib/access';
import { route, ok, readJson, HttpError } from '@/lib/http';
import { db } from '@/db';
import { users, sessions, userModulePermissions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, audit } from '@/lib/auth';
import { z } from 'zod';

const accountSchema = z.object({
  fullName:z.string().trim().min(2).max(180),
  email:z.string().trim().toLowerCase().email(),
  role:z.enum(['CLIENT','COORDINATOR','ADMIN']),
  password:z.string().min(12),
});

export const GET = route(async () => {
  await requirePermission('users.manage');
  const result = await db.select({
    id:users.id, fullName:users.fullName, email:users.email, role:users.role,
    isActive:users.isActive, isRootAdmin:users.isRootAdmin, createdAt:users.createdAt,
  }).from(users).orderBy(users.createdAt);
  return ok({ users:result });
});

export const POST = route(async req => {
  const mother = await requirePermission('users.manage');
  const input = accountSchema.parse(await readJson(req));
  const [existing] = await db.select({id:users.id}).from(users).where(eq(users.email,input.email));
  if (existing) throw new HttpError(409,'Email already used');
  // Absolutely no module grants are inserted. Even ADMIN starts with zero access.
  const [created] = await db.insert(users).values({
    fullName:input.fullName, email:input.email, role:input.role,
    passwordHash:await hashPassword(input.password), emailVerifiedAt:new Date(),
    isRootAdmin:false,
  }).returning({id:users.id});
  await audit(mother.id,'USER_CREATED','user',created.id,{role:input.role,permissions:'NONE'});
  return ok({id:created.id},201);
});

export const PATCH = route(async req => {
  const mother = await requirePermission('users.manage');
  const input = z.object({
    id:z.string().uuid(), role:z.enum(['CLIENT','COORDINATOR','ADMIN']), isActive:z.boolean(),
  }).parse(await readJson(req));
  const [before] = await db.select().from(users).where(eq(users.id,input.id));
  if (!before) throw new HttpError(404,'Account not found');
  if (before.isRootAdmin) throw new HttpError(403,'The Mother Admin account cannot be demoted or deactivated');
  if (before.id === mother.id) throw new HttpError(403,'You cannot modify your own access');

  await db.transaction(async tx => {
    await tx.update(users).set({
      role:input.role, isActive:input.isActive, updatedAt:new Date(),
    }).where(eq(users.id,input.id));
    // Role transfers must never carry privileged permissions to a new identity.
    if (before.role !== input.role) {
      await tx.delete(userModulePermissions).where(eq(userModulePermissions.userId,input.id));
    }
    if (!input.isActive || before.role !== input.role) {
      await tx.delete(sessions).where(eq(sessions.userId,input.id));
    }
  });
  await audit(mother.id,'USER_ACCESS_UPDATED','user',input.id,{
    role:input.role, isActive:input.isActive, permissionsReset:before.role !== input.role,
  });
  return ok({success:true});
});
