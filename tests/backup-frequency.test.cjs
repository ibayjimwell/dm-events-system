const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function load(file, dependencies = {}, env = {}) {
  const compiled = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Buffer, Date, Set, Number, String, Request, Response, console, process: { env },
    require: id => dependencies[id] || require(id),
  }, { filename: file });
  return module.exports;
}

const schedule = load('src/lib/backupSchedule.ts');

test('weekly and monthly decisions use Manila local date, including UTC day boundaries', () => {
  const { shouldRunBackup } = schedule;
  const mondayPH = new Date('2026-11-08T18:30:00Z'); // Monday Nov 9, 2:30 AM Manila
  const sundayPH = new Date('2026-11-07T18:30:00Z');
  assert.equal(shouldRunBackup('daily', sundayPH), true);
  assert.equal(shouldRunBackup('weekly', mondayPH), true);
  assert.equal(shouldRunBackup('weekly', sundayPH), false);
  assert.equal(shouldRunBackup('monthly', mondayPH), false);
  assert.equal(shouldRunBackup('monthly', new Date('2026-11-30T18:30:00Z')), true); // Dec 1 PH
  assert.equal(shouldRunBackup('monthly', new Date('2026-11-01T18:30:00Z')), false);
  assert.equal(schedule.isBackupFrequency('weekly'), true);
  assert.equal(schedule.isBackupFrequency('hourly'), false);
});

test('schedule displays correct next window and does not incorrectly report weekly/monthly backups as overdue', () => {
  const { backupRunWindow, isAutomaticBackupOverdue } = schedule;
  assert.equal(backupRunWindow('weekly', new Date('2026-11-05T03:00:00Z')).nextAt, '2026-11-08T18:00:00.000Z');
  assert.equal(backupRunWindow('monthly', new Date('2026-11-05T03:00:00Z')).nextAt, '2026-11-30T18:00:00.000Z');
  assert.equal(isAutomaticBackupOverdue('weekly', null, null, new Date('2026-11-05T03:00:00Z')), true); // Monday should have run
  assert.equal(isAutomaticBackupOverdue('weekly', null, '2026-11-04T00:00:00Z', new Date('2026-11-05T03:00:00Z')), false);
  assert.equal(isAutomaticBackupOverdue('weekly', '2026-11-02T18:10:00Z', null, new Date('2026-11-05T03:00:00Z')), false);
  assert.equal(isAutomaticBackupOverdue('monthly', null, '2026-11-04T00:00:00Z', new Date('2026-11-05T03:00:00Z')), false);
  assert.equal(isAutomaticBackupOverdue('daily', null, null, new Date('2026-11-05T18:30:00Z')), false); // grace window
});

test('persisted backup frequency survives a new library instance and is validated', async () => {
  const saved = new Map();
  const env = {
    DATABASE_URL: 'postgres://sample', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake', CRON_SECRET: 'a'.repeat(32),
    BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const bucket = {
    storage: {
      getBucket: async () => ({ data: { public: false }, error: null }),
      createBucket: async () => ({ error: null }),
      from() {
        return {
          list: async (folder) => ({ data: Array.from(saved.keys()).filter(k => k.startsWith(folder + '/'))
            .map(k => ({ name: k.substring(folder.length + 1), created_at: new Date().toISOString() })), error: null }),
          upload: async (key, bytes, options) => {
            if (!options.upsert && saved.has(key)) return { error: Error('already exists') };
            saved.set(key, Buffer.from(bytes)); return { error: null };
          },
          download: async key => saved.has(key) ? { data: new Blob([saved.get(key)]), error: null } : { data: null, error: Error('Missing') },
        };
      },
    },
  };
  const dependencies = {
    '@supabase/supabase-js': { createClient: () => bucket },
    '@/lib/http': { HttpError },
    '@/lib/manualBackup': { createManualBackup: async () => { throw Error('not used'); } },
    '@/lib/managedBackupCrypto': { isBackupEncryptionConfigured: () => true },
    '@/lib/manualBackupFormat': {},
    '@/lib/backupSchedule': schedule,
  };
  const first = load('src/lib/managedBackupStore.ts', dependencies, env);
  assert.equal((await first.getStoredBackupSchedule()).frequency, 'daily');
  const updated = await first.saveStoredBackupSchedule('monthly');
  assert.equal(updated.frequency, 'monthly');
  assert.ok(updated.updatedAt);
  assert.equal(JSON.parse(saved.get('config/backup-schedule.json')).frequency, 'monthly');
  const second = load('src/lib/managedBackupStore.ts', dependencies, env);
  assert.equal((await second.getStoredBackupSchedule()).frequency, 'monthly');
  await assert.rejects(() => first.saveStoredBackupSchedule('hourly'), /Choose Daily, Weekly, or Monthly/);
});

test('the API validates permissions, cron secret and the saved frequency; .gitignore cannot exclude the route', () => {
  const api = read('app/api/backups/route.ts');
  const cron = read('app/api/cron/daily-backup/route.ts');
  const ui = read('src/components/admin/Backups.tsx');
  assert.match(api, /requirePermission\('backups\.manage'\)/);
  assert.match(api, /export const PATCH = route/);
  assert.match(api, /isBackupFrequency\(body\.frequency\)/);
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /getStoredBackupSchedule\(\)/);
  assert.match(cron, /shouldRunBackup\(schedule\.frequency\)/);
  for (const f of ['daily', 'weekly', 'monthly']) assert.match(ui, new RegExp(`<option value="${f}">`));
  assert.match(read('.gitignore'), /^\/backups\/$/m);
  assert.doesNotMatch(read('.gitignore'), /^backups\/$/m);
});

test('cron rejects unauthenticated traffic, skips non-scheduled days, and creates only on due days', async () => {
  const env = { CRON_SECRET: 'z'.repeat(32) };
  let frequency = 'weekly';
  let saved = 0;
  const cron = load('app/api/cron/daily-backup/route.ts', {
    '@/lib/managedBackupStore': {
      managedBackupConfig: () => ({ ready: true }),
      getStoredBackupSchedule: async () => ({ frequency, updatedAt: null }),
      createStoredBackup: async () => { saved++; return { alreadyExisted: false, backup: { path: 'automatic/example.json.gz.enc' } }; },
    },
    '@/lib/backupSchedule': { shouldRunBackup: value => value === 'daily' },
  }, env);
  const noAuth = await cron.GET(new Request('https://example.com/api/cron/daily-backup'));
  assert.equal(noAuth.status, 401);
  assert.equal(saved, 0);
  const auth = { Authorization: 'Bearer ' + env.CRON_SECRET };
  const skipped = await cron.GET(new Request('https://example.com/api/cron/daily-backup', { headers: auth }));
  assert.equal(skipped.status, 200);
  assert.equal((await skipped.json()).skipped, true);
  assert.equal(saved, 0);
  frequency = 'daily';
  const completed = await cron.GET(new Request('https://example.com/api/cron/daily-backup', { headers: auth }));
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).skipped, false);
  assert.equal(saved, 1);
});

test('schedule PATCH cannot be used without backup permission and validates the input', async () => {
  let denied = true;
  let wrote = '';
  const endpoint = load('app/api/backups/route.ts', {
    '@/lib/access': { requirePermission: async () => { if (denied) throw Error('No permission'); return { id: 'admin-1' }; } },
    '@/lib/http': {
      route: handler => handler,
      ok: value => Response.json(value),
      readJson: req => req.json(),
      HttpError: class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } },
    },
    '@/lib/auth': { audit: async () => {} },
    '@/lib/managedBackupStore': {
      managedBackupConfig: () => ({ ready: true }),
      saveStoredBackupSchedule: async frequency => { wrote = frequency; return { frequency, updatedAt: '2026-11-05T00:00:00Z' }; },
    },
    '@/lib/backupSchedule': schedule,
  });
  const req = payload => new Request('https://example.com/api/backups', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  await assert.rejects(() => endpoint.PATCH(req({ frequency: 'weekly' })), /No permission/);
  assert.equal(wrote, '');
  denied = false;
  await assert.rejects(() => endpoint.PATCH(req({ frequency: 'hourly' })), /Choose a backup frequency/);
  const result = await endpoint.PATCH(req({ frequency: 'monthly' }));
  assert.equal(result.status, 200);
  assert.equal(wrote, 'monthly');
  assert.equal((await result.json()).schedule.frequency, 'monthly');
});
