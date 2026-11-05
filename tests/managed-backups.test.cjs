const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function loadCrypto() {
  const source = read('src/lib/managedBackupCrypto.ts');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const env = { BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  vm.runInNewContext(js, {
    module, exports: module.exports, process: { env }, Buffer,
    require: id => id === '@/lib/http' ? { HttpError } : require(id),
  });
  return { ...module.exports, env };
}

test('AES-256-GCM backup encryption round trips and detects tampering', () => {
  const { encryptBackup, decryptBackup } = loadCrypto();
  const raw = Buffer.from('gzip payload to protect \u2605');
  const encrypted = encryptBackup(raw);
  assert.equal(encrypted.subarray(0, 4).toString(), 'DME1');
  assert.notDeepEqual(encrypted, raw);
  assert.equal(decryptBackup(encrypted).toString(), raw.toString());
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBackup(tampered), /cannot be decrypted/i);
});

test('missing or invalid encryption key fails closed', () => {
  const { encryptBackup, env } = loadCrypto();
  env.BACKUP_ENCRYPTION_KEY = 'invalid';
  assert.throws(() => encryptBackup(Buffer.from('test')), /BACKUP_ENCRYPTION_KEY/);
});

test('daily schedule is protected and installer merges existing cron jobs', () => {
  const source = read('app/api/cron/daily-backup/route.ts');
  const installer = read('scripts/configure-managed-backup.mjs');
  assert.match(source, /Authorization|authorization/);
  assert.match(source, /process\.env\.CRON_SECRET/);
  assert.match(source, /createStoredBackup\('automatic'\)/);
  assert.match(installer, /schedule: '0 18 \* \* \*'/);
  assert.match(installer, /filtered = crons\.filter/);
  assert.match(installer, /\/backups\//);
});

test('stored archive operations are permission gated and path-filtered', () => {
  const file = read('app/api/backups/file/route.ts');
  const store = read('src/lib/managedBackupStore.ts');
  assert.match(file, /export const GET = route/);
  assert.match(file, /export const DELETE = route/);
  assert.match(file, /requirePermission\('backups\.manage'\)/);
  assert.match(file, /readStoredBackup\(/);
  assert.match(store, /PATH_PATTERN/);
  assert.match(store, /public: false/);
  assert.match(store, /upsert: false/);
  assert.match(store, /encryptBackup\(/);
  assert.match(store, /decryptBackup\(/);
  assert.match(store, /unpackManualBackup\(/);
  assert.match(store, /AUTOS_TO_RETAIN = 7/);
});

test('the Git-ignored route regression stays fixed', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^\/backups\/$/m);
  assert.doesNotMatch(ignore, /^backups\/$/m);
  for (const pathName of ['app/api/backups/route.ts', 'app/api/backups/file/route.ts', 'app/api/cron/daily-backup/route.ts']) {
    assert.ok(fs.existsSync(path.join(root, pathName)), pathName);
  }
});

test('all managed backup files parse into TypeScript AST without syntax errors', () => {
  for (const file of [
    'src/lib/managedBackupCrypto.ts', 'src/lib/managedBackupStore.ts', 'src/lib/backupSchedule.ts',
    'app/api/backups/route.ts', 'app/api/backups/file/route.ts',
    'app/api/cron/daily-backup/route.ts', 'src/components/admin/Backups.tsx',
    'src/components/admin/BackupSettings.tsx',
  ]) {
    const tree = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.equal(tree.parseDiagnostics.length, 0, file);
  }
});

function transpileFile(file, requires, overrides = {}) {
  const src = read(file);
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports, require: id => requires[id] || require(id),
    Buffer, Date, Set, Number, String, console, process: { env: overrides.env || {} },
  }, { filename: file });
  return module.exports;
}

test('managed snapshots can be saved, listed, decrypted, inspected and deleted using mocked Storage', async () => {
  const env = {
    DATABASE_URL: 'postgres://irrelevant', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'sample-service-role-key',
    BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), CRON_SECRET: 'a'.repeat(32),
  };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const http = { HttpError };
  const crypt = transpileFile('src/lib/managedBackupCrypto.ts', { '@/lib/http': http }, { env });
  const schedule = transpileFile('src/lib/backupSchedule.ts', {}, { env });
  const format = transpileFile('src/lib/manualBackupFormat.ts', {}, { env });
  const sample = format.packManualBackup({ format: format.MANUAL_BACKUP_FORMAT, exportedAt: '2026-11-05T00:00:00Z', schema: 'public', tableCount: 1, rowCount: 1, tables: [{ name: 'users', columns: ['id'], rows: ['{"id":"u1"}'] }] });
  const stored = new Map();
  const store = {
    storage: {
      getBucket: async () => ({ data: { public: false }, error: null }),
      createBucket: async () => ({ error: null }),
      from() {
        return {
          list: async (folder) => ({ data: Array.from(stored, ([key, value]) => ({ key, value }))
            .filter(x => x.key.startsWith(folder + '/')).map(x => ({ name: x.key.split('/')[1], created_at: x.value.createdAt, metadata: { size: x.value.data.length } })), error: null }),
          upload: async (key, data) => {
            if (stored.has(key)) return { error: new Error('Already exists') };
            stored.set(key, { data: Buffer.from(data), createdAt: new Date().toISOString() });
            return { error: null };
          },
          download: async key => stored.has(key)
            ? { data: new Blob([stored.get(key).data]), error: null }
            : { data: null, error: new Error('Not found') },
          remove: async keys => {
            const gone = keys.filter(x => stored.delete(x));
            return { data: gone.map(name => ({ name })), error: null };
          },
        };
      },
    },
  };
  const lib = transpileFile('src/lib/managedBackupStore.ts', {
    '@supabase/supabase-js': { createClient: () => store },
    '@/lib/http': http,
    '@/lib/manualBackup': { createManualBackup: async () => ({ archive: sample, filename: 'backup.json.gz' }) },
    '@/lib/managedBackupCrypto': crypt,
    '@/lib/backupSchedule': schedule,
    '@/lib/manualBackupFormat': format,
  }, { env });
  const manual = await lib.createStoredBackup('manual');
  assert.equal(manual.alreadyExisted, false);
  assert.equal(stored.size, 1);
  assert.ok(!stored.get(manual.backup.path).data.includes(Buffer.from('"id":"u1"')));
  assert.equal((await lib.listStoredBackups())[0].path, manual.backup.path);
  const recovered = await lib.readStoredBackup(manual.backup.path);
  assert.equal(recovered.payload.rowCount, 1);
  assert.deepEqual(recovered.archive, sample);
  const automatic = await lib.createStoredBackup('automatic');
  assert.equal(automatic.alreadyExisted, false);
  const retried = await lib.createStoredBackup('automatic');
  assert.equal(retried.alreadyExisted, true);
  assert.equal(stored.size, 2);
  await assert.rejects(() => lib.readStoredBackup('manual/../secrets'), /Invalid backup filename/);
  assert.equal(await lib.deleteStoredBackup(manual.backup.path), manual.backup.path);
  assert.equal(stored.size, 1);
});
