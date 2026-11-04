const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const get = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('backup status endpoint is dynamic, authorized and reads stored history', () => {
  const source = get('app/api/backups/route.ts');
  assert.match(source, /export const GET\s*=\s*route\(/);
  assert.match(source, /requirePermission\('backups\.manage'\)/);
  assert.match(source, /export const dynamic = 'force-dynamic'/);
  assert.match(source, /getBackupHistory/);
  assert.doesNotMatch(source, /backupDispatchConfigured|BACKUP_GITHUB_TOKEN/);
});

test('backup UI points to real local route, with a clear availability error', () => {
  const source = get('src/components/admin/Backups.tsx');
  assert.match(source, /api<BackupResponse>\('\/api\/backups'\)/);
  assert.match(source, /Could not load backup history/);
});

test('backup route diagnostic still checks 404 without credentials', () => {
  const source = get('scripts/check-backup-route.mjs');
  assert.match(source, /method: 'GET'/);
  assert.match(source, /response\.status === 404/);
  assert.match(source, /\[401, 403\]/);
});
