const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = path => fs.readFileSync(require('node:path').join(root, path), 'utf8');

function executeTs(filename, injectedRequire = require) {
  const js = ts.transpileModule(read(filename), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { require: injectedRequire, module, exports: module.exports, Buffer, Date, RegExp, process, Error, Set }, { filename });
  return module.exports;
}

test('weekly and monthly backup dates are computed in Philippine time', () => {
  const { nextBackupRun } = executeTs('src/lib/backupSchedule.ts');
  assert.equal(nextBackupRun('OFF'), null);
  assert.equal(nextBackupRun('DAILY', new Date('2026-11-04T11:00:00Z')).toISOString(), '2026-11-04T16:15:00.000Z');
  // Nov 4, 2026 Wednesday, next Monday Nov 9 at 00:15 PHT = Nov 8 16:15 UTC.
  assert.equal(nextBackupRun('WEEKLY', new Date('2026-11-04T11:00:00Z')).toISOString(), '2026-11-08T16:15:00.000Z');
  // Next month Dec 1, 2026 at 00:15 PHT = Nov 30 16:15 UTC.
  assert.equal(nextBackupRun('MONTHLY', new Date('2026-11-04T11:00:00Z')).toISOString(), '2026-11-30T16:15:00.000Z');
});

test('encrypted archive round-trips and rejects tampering', () => {
  const previous = process.env.BACKUP_ARCHIVE_KEY;
  process.env.BACKUP_ARCHIVE_KEY = 'ab'.repeat(32);
  try {
    const mod = executeTs('src/lib/backupArchiveCrypto.ts', id => id === '@/lib/http'
      ? { HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } } }
      : require(id));
    const original = Buffer.from('backup-with-private-customer-information');
    const encrypted = mod.encryptBackupArchive(original);
    assert.equal(encrypted.subarray(0, 4).toString(), 'DME2');
    assert.notEqual(encrypted.toString('utf8'), original.toString('utf8'));
    assert.deepEqual(mod.decryptBackupArchive(encrypted), original);
    encrypted[encrypted.length - 1] ^= 0xff;
    assert.throws(() => mod.decryptBackupArchive(encrypted), /verification failed/i);
  } finally { if (previous === undefined) delete process.env.BACKUP_ARCHIVE_KEY; else process.env.BACKUP_ARCHIVE_KEY = previous; }
});

test('archive and scheduler APIs require module permission and the scheduled job verifies its secret', () => {
  for (const name of ['app/api/backups/route.ts', 'app/api/backups/[id]/route.ts', 'app/api/backups/[id]/download/route.ts', 'app/api/backups/schedule/route.ts']) {
    assert.match(read(name), /requirePermission\('backups.manage'\)/, name);
  }
  const cron = read('app/api/cron/database-backup/route.ts');
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /runDueScheduledBackup/);
  assert.match(read('src/lib/backupManager.ts'), /lte\(backupSchedules.nextRunAt, now\)/);
  assert.match(read('src/lib/backupStorage.ts'), /public: false/);
  assert.match(read('src/lib/backupStorage.ts'), /existing.data.public/);
  assert.match(read('src/lib/backupManager.ts'), /unpackManualBackup\(bytes\)/);
});

test('migrations, configured cron and the backup visualizations are included', () => {
  const migration = read('drizzle/0013_backup_history_schedule.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public.backup_archives/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public.backup_schedules/);
  const journal = JSON.parse(read('drizzle/meta/_journal.json'));
  assert.equal(journal.entries.at(-1).tag, '0013_backup_history_schedule');
  const cron = JSON.parse(read('vercel.json')).crons;
  assert.deepEqual(cron, [{ path: '/api/cron/database-backup', schedule: '15 16 * * *' }]);
  const ui = read('src/components/admin/Backups.tsx');
  for (const phrase of ['Backup activity', 'Backup history', 'Backup details', 'Automatic backups', 'Records by table']) assert.match(ui, new RegExp(phrase));
});

test('changed TS and TSX modules parse', () => {
  for (const filename of [
    'src/db/schema.ts', 'src/lib/backupSchedule.ts', 'src/lib/backupArchiveCrypto.ts',
    'src/lib/backupStorage.ts', 'src/lib/backupManager.ts', 'src/components/admin/Backups.tsx',
    'src/components/admin/BackupSettings.tsx', 'app/api/backups/route.ts',
    'app/api/backups/schedule/route.ts', 'app/api/backups/[id]/route.ts',
    'app/api/backups/[id]/download/route.ts', 'app/api/cron/database-backup/route.ts',
  ]) {
    const result = ts.transpileModule(read(filename), {
      fileName: filename, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    const errors = (result.diagnostics ?? []).filter(x => x.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${filename}: ${errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, ' ')).join(', ')}`);
  }
});
