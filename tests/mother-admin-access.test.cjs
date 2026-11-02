const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const src = p => fs.readFileSync(p,'utf8');
const runtime = {exports:{}};
const compiled = ts.transpileModule(src('src/lib/permissions.ts'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
Function('exports','require','module',compiled)(runtime.exports,require,runtime);
const access = runtime.exports;

test('new accounts have no inherited permissions, regardless of their role',()=>{
  for (const role of ['CLIENT','COORDINATOR','ADMIN']) {
    assert.deepEqual(access.DEFAULT_PERMISSIONS[role],[]);
    for(const permission of access.PERMISSION_KEYS) assert.equal(access.defaultAccess(role,permission),false);
  }
  assert.match(src('app/api/users/route.ts'),/isRootAdmin:false/);
  assert.doesNotMatch(src('app/api/users/route.ts'),/insert\(userModulePermissions\)/);
});
test('client identity cannot gain staff permissions and staff cannot impersonate clients',()=>{
  assert(access.canAssignPermission('CLIENT','messages.own'));
  assert(access.canAssignPermission('CLIENT','bookings.create.own'));
  assert(!access.canAssignPermission('CLIENT','messages.staff'));
  assert(!access.canAssignPermission('CLIENT','packages.manage'));
  assert(!access.canAssignPermission('COORDINATOR','bookings.create.own'));
  assert(access.canAssignPermission('ADMIN','packages.manage'));
  assert(access.canAssignPermission('COORDINATOR','packages.manage'));
  for(const role of ['CLIENT','COORDINATOR','ADMIN']) assert(!access.canAssignPermission(role,'users.manage'));
});
test('permission checks are explicit, server-side, and root-ownership is immutable',()=>{
  const server = src('src/lib/access.ts');
  assert.match(server,/user\.role === 'ADMIN' && user\.isRootAdmin/);
  assert.match(server,/userGrants = cache\(/);
  assert.match(server,/row\.allowed/);
  assert.match(server,/canAssignPermission\(user\.role, permission\)/);
  const api = src('app/api/permissions/route.ts');
  assert.match(api,/await requirePermission\('users\.manage'\)/);
  assert.match(api,/if \(user\.isRootAdmin\)/);
  assert.match(api,/canAssignPermission\(user\.role, input\.permission\)/);
  const users = src('app/api/users/route.ts');
  assert.match(users,/if \(before\.isRootAdmin\)/);
  assert.match(users,/await tx\.delete\(userModulePermissions\)/);
});
test('upgrade preserves old access but requires explicit Mother Admin bootstrap',()=>{
  const sql=src('drizzle/0010_mother_admin_module_access.sql');
  assert.match(sql,/ADD COLUMN "is_root_admin"/);
  assert.match(sql,/CREATE UNIQUE INDEX "users_one_root_admin_idx"/);
  assert.match(sql,/INSERT INTO "user_module_permissions"/);
  assert.match(sql,/ON CONFLICT \("user_id", "permission"\) DO NOTHING/);
  assert.doesNotMatch(sql,/UPDATE "users" SET "is_root_admin" = true/);
  const bootstrap=src('scripts/bootstrap-mother-admin.ts');
  assert.match(bootstrap,/SEED_ADMIN_EMAIL/);
  assert.match(bootstrap,/existing && existing\.id !== target\.id/);
});
test('user access screen edits every role and protects the Mother Admin',()=>{
  const ui=src('src/components/admin/UsersEditor.tsx');
  assert.match(ui,/editableUsers\.map/);
  assert.match(ui,/module\.assignable/);
  assert.match(ui,/selectedUser\.isRootAdmin/);
  assert.match(ui,/New accounts \(including Administrators\) start with no module permissions/);
  assert.match(src('src/lib/portalHome.ts'),/\/access-pending/);
  assert.match(src('app/(public)/access-pending/page.tsx'),/Waiting for module access/);
});
