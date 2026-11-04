const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');

function loadStorage() {
  const js = ts.transpileModule(read('src/lib/backupStorage.ts'), {
    fileName: 'src/lib/backupStorage.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const state = { calls: [], bucket: null, getError: { statusCode: '404', message: 'Bucket not found' } };
  const fakeStorage = {
    getBucket: async () => ({ data: state.bucket, error: state.getError }),
    createBucket: async (bucket, options) => { state.calls.push({ bucket, options }); state.bucket = { id: bucket, public: options.public }; state.getError = null; return { data: state.bucket, error: null }; },
  };
  const requireFake = id => id === '@supabase/supabase-js' ? {
    createClient: () => ({ storage: fakeStorage }),
  } : id === '@/lib/http' ? {
    HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } },
  } : id === '@/lib/backupArchiveCrypto' ? {
    backupEncryptionReady: () => /^[0-9a-f]{64}$/i.test(process.env.BACKUP_ARCHIVE_KEY ?? ''),
  } : require(id);
  vm.runInNewContext(js, { module, exports: module.exports, require: requireFake, process, URL, Buffer, Error, Number, Boolean, console }, { filename: 'backupStorage.ts' });
  return { ...module.exports, state };
}

const KEYS = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'BACKUP_ARCHIVE_KEY'];
function withEnv(values, callback) {
  const before = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, values);
  const restore = () => { for (const k of KEYS) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; } };
  try { const result = callback(); if (result && typeof result.then === 'function') return result.finally(restore); restore(); return result; }
  catch (error) { restore(); throw error; }
}

test('backup configuration explains all missing items, without leaking secrets', () => withEnv({}, () => {
  const storage = loadStorage();
  assert.equal(storage.backupStorageSetup().configured, false);
  assert.deepEqual([...storage.backupStorageSetup().issues], ['SUPABASE_URL', 'SUPABASE_SERVER_KEY', 'BACKUP_ARCHIVE_KEY']);
}));

test('supports modern Supabase server secret and browser URL fallback for server-side backups', () => withEnv({
  NEXT_PUBLIC_SUPABASE_URL: 'https://myproject.supabase.co',
  SUPABASE_SECRET_KEY: `sb_secret_${'a'.repeat(32)}`,
  BACKUP_ARCHIVE_KEY: 'af'.repeat(32),
}, async () => {
  const storage = loadStorage();
  assert.equal(storage.backupStorageReady(), true);
  await storage.ensureBackupBucket();
  assert.equal(storage.state.calls.length, 1);
  assert.equal(storage.state.calls[0].bucket, 'dm-events-database-backups');
  assert.equal(storage.state.calls[0].options.public, false);
}));

test('rejects public publishable key and invalid encryption key', () => withEnv({
  SUPABASE_URL: 'https://myproject.supabase.co',
  SUPABASE_SECRET_KEY: `sb_publishable_${'b'.repeat(32)}`,
  BACKUP_ARCHIVE_KEY: 'invalid',
}, () => {
  assert.deepEqual([...loadStorage().backupStorageSetup().issues], ['SUPABASE_SERVER_KEY', 'BACKUP_ARCHIVE_KEY']);
}));

test('accepts legacy service-role JWT, blocks legacy anon JWT', () => {
  const legacy = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  const base = { SUPABASE_URL: 'https://myproject.supabase.co', BACKUP_ARCHIVE_KEY: 'ab'.repeat(32) };
  withEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: legacy('service_role') }, () => assert.equal(loadStorage().backupStorageReady(), true));
  withEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: legacy('anon') }, () => assert.equal(loadStorage().backupStorageReady(), false));
});

test('API and Backup Center show specific setup issues; verification script is shipped', () => {
  assert.match(read('app/api/backups/route.ts'), /setupIssues: storage.issues/);
  assert.match(read('src/components/admin/Backups.tsx'), /Backup configuration required/);
  assert.match(read('src/components/admin/Backups.tsx'), /Supabase server access key/);
  assert.match(read('scripts/diagnose-backup-storage.mjs'), /--initialize/);
  assert.equal(JSON.parse(read('package.json')).scripts['backup:diagnose'], 'node scripts/diagnose-backup-storage.mjs');
});
