/**
 * Run ONCE after migration 0010. Never accepts an arbitrary request-supplied ID.
 * The existing seed-admin email designates the immutable Mother Admin.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { users } from '../src/db/schema';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('Set SEED_ADMIN_EMAIL to the intended existing Mother Admin email before running this script.');
  const [target] = await db.select({
    id:users.id, role:users.role, isActive:users.isActive,
    isRootAdmin:users.isRootAdmin,
  }).from(users).where(eq(users.email,email)).limit(1);
  if (!target || target.role !== 'ADMIN' || !target.isActive)
    throw new Error('SEED_ADMIN_EMAIL must identify an existing active ADMIN account. Run npm run seed first if needed.');
  const [existing] = await db.select({id:users.id}).from(users).where(eq(users.isRootAdmin,true)).limit(1);
  if (existing && existing.id !== target.id)
    throw new Error('Another Mother Admin already exists. Ownership was not changed.');
  if (!target.isRootAdmin) {
    await db.update(users).set({isRootAdmin:true,updatedAt:new Date()}).where(eq(users.id,target.id));
  }
  console.log('Mother Admin verified and protected for the configured SEED_ADMIN_EMAIL.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
