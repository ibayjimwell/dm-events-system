/**
 * Managed-backup history regression checks.
 * Replaces obsolete backup-manager/archive tests from the pre-managed version.
 * These checks are read-only and never contact Supabase or Vercel.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => readFileSync(path.join(root, name), 'utf8');

test('managed backup API supports history, creation and schedule changes', () => {
  const route = read('app/api/backups/route.ts');
  assert.match(route, /export const GET\s*=/);
  assert.match(route, /export const POST\s*=/);
  assert.match(route, /export const PATCH\s*=/);
  assert.match(route, /listStoredBackups/);
  assert.match(route, /saveStoredBackupSchedule/);
  assert.match(route, /requirePermission\('backups\.manage'\)/);
});

test('private managed storage handles encrypted archives and history management', () => {
  const store = read('src/lib/managedBackupStore.ts');
  assert.match(store, /createStoredBackup/);
  assert.match(store, /listStoredBackups/);
  assert.match(store, /readStoredBackup/);
  assert.match(store, /deleteStoredBackup/);
  assert.match(store, /encryptBackup/);
  assert.match(store, /decryptBackup/);
  const fileRoute = read('app/api/backups/file/route.ts');
  assert.match(fileRoute, /requirePermission\('backups\.manage'\)/);
  assert.match(fileRoute, /export const GET\s*=/);
  assert.match(fileRoute, /export const DELETE\s*=/);
});

test('daily Vercel cron uses the stored schedule and secret authentication', () => {
  const source = read('app/api/cron/daily-backup/route.ts');
  assert.match(source, /getStoredBackupSchedule/);
  assert.match(source, /shouldRunBackup/);
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /createStoredBackup\('automatic'\)/);
  const schedule = read('src/lib/backupSchedule.ts');
  for (const f of ['daily', 'weekly', 'monthly']) assert.ok(schedule.includes(f));
  assert.ok(!existsSync(path.join(root, 'src/lib/backupManager.ts')));
  assert.ok(!existsSync(path.join(root, 'app/api/backups/schedule/route.ts')));
  assert.ok(!existsSync(path.join(root, 'app/api/cron/database-backup/route.ts')));
});
