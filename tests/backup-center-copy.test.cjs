const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('database backup has operational copy across administration', () => {
  const backup = file('src/components/admin/Backups.tsx');
  const policy = file('src/components/admin/BackupSettings.tsx');
  const hub = file('src/components/admin/SettingsHub.tsx');
  const menu = file('app/(portal)/admin/maintenance/page.tsx');
  const overview = file('src/components/admin/Overview.tsx');
  const api = file('app/api/backups/route.ts');
  assert.match(backup, />Database Backup<\/h1>/);
  assert.match(policy, /Backup &amp; Recovery/);
  assert.match(hub, /> Database Backup/);
  assert.match(menu, /backup history and manage automatic schedules/);
  assert.match(overview, /Review snapshots and automatic schedules/);
  assert.match(api, /getBackupHistory/);
  for (const content of [backup, policy, hub, menu, overview, api]) {
    assert.doesNotMatch(content, /No Cloudflare|no card|no credit card|GitHub runner|No subscription|Simple Backup Center|for a simple project/i);
  }
});

test('backup UI keeps actual operation and security information', () => {
  const ui = file('src/components/admin/Backups.tsx');
  assert.match(ui, /api\('\/api\/backups'/);
  assert.match(ui, /Download backup/);
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /URL\.createObjectURL/);
  assert.match(ui, /Backup history/);
  assert.match(ui, /Automatic backups/);
  assert.match(ui, /confidential records|private archive|restricted to authorized/i);
});
