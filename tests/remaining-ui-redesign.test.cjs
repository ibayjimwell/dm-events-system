const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const source = (name) => readFileSync(path.join(root,name),'utf8');

test('workspace stylesheet is loaded globally without modifying messenger components',()=>{
  assert.match(source('app/layout.tsx'),/import ["']\.\/operations\.css["']/);
  assert.match(source('app/operations.css'),/\.workspace-calendar__day/);
  assert.match(source('app/operations.css'),/prefers-reduced-motion/);
});
test('all role dashboards preserve the original authorized summary query',()=>{
  for (const name of ['src/components/shared/Dashboard.tsx','src/components/admin/Overview.tsx']) {
    assert.match(source(name),/\/api\/summary/);
    assert.match(source(name),/useLiveQuery/);
  }
  assert.match(source('src/components/shared/Dashboard.tsx'),/permissions\.includes\(action\.permission\)/);
  assert.match(source('src/components/admin/Overview.tsx'),/permissions\.includes\(action\.p as Permission\)/);
});
test('event calendar stays within existing role and API boundaries',()=>{
  const calendar = source('src/components/coordinator/Calendar.tsx');
  assert.match(calendar,/\/api\/calendar\?month=/);
  assert.match(calendar,/role === 'ADMIN'/);
  assert.match(calendar,/aria-pressed/);
  assert.match(calendar,/Asia\/Manila/);
});
test('profile editor persists only authorized profile fields',()=>{
  const profile = source('src/components/client/Profile.tsx');
  assert.match(profile,/\/api\/auth\/me/);
  assert.match(profile,/\/api\/profile/);
  assert.match(profile,/fullName: name\.trim\(\), phone: normalized/);
  assert.doesNotMatch(profile,/email:\s*user\.email\s*[,}]/);
});
test('analytics displays ledger movements and preserves CSV export endpoint',()=>{
  const analytics = source('src/components/admin/Analytics.tsx');
  assert.match(analytics,/\/api\/analytics/);
  assert.match(analytics,/\/api\/report\.csv/);
  assert.match(analytics,/movementType/);
  assert.match(analytics,/Asia\/Manila/);
});
test('account changes require explicit confirmation for role change and deactivation',()=>{
  const users=source('src/components/admin/UsersEditor.tsx');
  assert.match(users,/window\.confirm/);
  assert.match(users,/update\.isActive === false/);
  assert.match(users,/\/api\/permissions/);
});
test('notification actions retain authenticated server endpoints',()=>{
  const notifications=source('src/components/admin/NotificationsEditor.tsx');
  for (const name of ['/api/notifications','/api/notifications/dispatch','/api/notifications/test-email']) assert.ok(notifications.includes(name));
  assert.match(notifications,/filteredItems\.map/);
});
test('backup controls retain secure server endpoints and gated restore model',()=>{
  const settings=source('src/components/admin/BackupSettings.tsx');
  const history=source('src/components/admin/Backups.tsx');
  assert.match(settings,/\/api\/settings/);
  assert.match(history,/\/api\/backups/);
  assert.match(history,/window\.confirm/);
  assert.match(history,/npm run restore/);
});
test('maintenance menu keeps server-side permission checks',()=>{
  const hub=source('app/(portal)/admin/maintenance/page.tsx');
  assert.match(hub,/await permissionSet\(user\)/);
  assert.match(hub,/allowed\.has\(module\.permission as Permission\)/);
});
