const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

function formatModule() {
  const src = source('src/lib/manualBackupFormat.ts');
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require, Buffer, Set, Object, JSON, Error }, { filename: 'manualBackupFormat.js' });
  return module.exports;
}

function fixture() {
  return {
    format: 'dm-events-public-data-v1', exportedAt: '2026-11-04T03:00:00.000Z', schema: 'public',
    tableCount: 2, rowCount: 2,
    tables: [
      { name: 'users', columns: ['id', 'full_name'], rows: ['{"id":"u1","full_name":"Sample Client"}'] },
      { name: 'bookings', columns: ['id', 'estimated_budget'], rows: ['{"id":"b1","estimated_budget":9007199254740993.99}'] },
    ],
  };
}

test('a manual backup roundtrips without losing precision in numeric JSON tokens', () => {
  const { packManualBackup, unpackManualBackup } = formatModule();
  const packed = packManualBackup(fixture());
  assert.equal(packed[0], 0x1f);
  assert.equal(packed[1], 0x8b);
  const unpacked = unpackManualBackup(packed);
  assert.equal(unpacked.rowCount, 2);
  assert.ok(unpacked.tables[1].rows[0].includes('9007199254740993.99'));
  assert.match(unpacked.sha256, /^[0-9a-f]{64}$/);
});

test('manual backup verification rejects modified data and table paths', () => {
  const { gzipSync, gunzipSync } = require('node:zlib');
  const { packManualBackup, unpackManualBackup } = formatModule();
  const original = JSON.parse(gunzipSync(packManualBackup(fixture())).toString('utf8'));
  const modified = structuredClone(original);
  modified.tables[0].rows[0] = '{"id":"evil","full_name":"Changed"}';
  assert.throws(() => unpackManualBackup(gzipSync(JSON.stringify(modified))), /integrity/i);
  const invalid = structuredClone(original);
  invalid.tables[0].name = 'users; DROP TABLE bookings';
  assert.throws(() => unpackManualBackup(gzipSync(JSON.stringify(invalid))), /table definition/i);
});

test('stored-backup APIs protect history, downloads and scheduling', () => {
  const api = source('app/api/backups/route.ts');
  const download = source('app/api/backups/[id]/download/route.ts');
  const schedule = source('app/api/backups/schedule/route.ts');
  assert.match(api, /requirePermission\('backups\.manage'\)/);
  assert.match(api, /saveBackup\('MANUAL'/);
  assert.match(download, /requirePermission\('backups\.manage'\)/);
  assert.match(download, /Content-Disposition/);
  assert.match(download, /no-store/);
  assert.match(schedule, /requirePermission\('backups\.manage'\)/);
  assert.doesNotMatch(api, /dispatchBackup|Github|R2|S3/);
});

test('export uses a read-only repeatable-read transaction and bounded public table data', () => {
  const lib = source('src/lib/manualBackup.ts');
  assert.match(lib, /ISOLATION LEVEL REPEATABLE READ, READ ONLY/);
  assert.match(lib, /n\.nspname = 'public'/);
  assert.match(lib, /to_jsonb\(t\)::text/);
  assert.match(lib, /totalBytes > maxBytes/);
  assert.match(lib, /maxTableRows/);
  assert.doesNotMatch(lib, /import .*@aws-sdk|execFileSync|spawnSync/);
});

test('manual restore is staging-only and refuses a nonempty target, with atomic FK relinking', () => {
  const script = source('scripts/restore.ts');
  assert.match(script, /RESTORE_DATABASE_URL/);
  assert.match(script, /RESTORE-TO-EMPTY-DATABASE/);
  assert.match(script, /databaseIdentity\(destination\) === databaseIdentity\(source\)/);
  assert.match(script, /has data\. Use a new EMPTY staging database/);
  assert.match(script, /await client\.begin/);
  assert.match(script, /nullable foreign keys/i);
  assert.match(script, /jsonb_populate_recordset/);
});

test('Backup UI shows archive history, details and same-origin downloads', () => {
  const ui = source('src/components/admin/Backups.tsx');
  assert.match(ui, /api\('\/api\/backups', \{ method: 'POST' \}/);
  assert.match(ui, /URL\.createObjectURL/);
  assert.match(ui, /Backup history/);
  assert.match(ui, /Automatic backups/);
  assert.match(ui, /window\.confirm/);
  assert.doesNotMatch(ui, /Queue R2 backup|GitHub runner configuration|dispatchBackup/);
});

test('export helper creates a real gzip archive from mocked public-schema query results', async () => {
  const js = ts.transpileModule(source('src/lib/manualBackup.ts'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const { packManualBackup, unpackManualBackup, MANUAL_BACKUP_FORMAT } = formatModule();
  const queries = [];
  const tx = {
    unsafe: async (query, params = []) => {
      queries.push({ query, params });
      if (query.startsWith('SET TRANSACTION')) return [];
      if (query.includes('FROM pg_catalog.pg_class')) return [{ name: 'users' }, { name: 'bookings' }];
      if (query.includes('FROM information_schema.columns')) return params[0] === 'users'
        ? [{ column_name: 'id' }, { column_name: 'full_name' }]
        : [{ column_name: 'id' }, { column_name: 'budget' }];
      if (query.includes('FROM public."users"')) return [{ payload: '{"id":"u1","full_name":"Ada"}' }];
      if (query.includes('FROM public."bookings"')) return [{ payload: '{"id":"b1","budget":9007199254740993.99}' }];
      throw new Error(`Unexpected SQL: ${query}`);
    },
  };
  const module = { exports: {} };
  const db = { sql: { begin: async fn => fn(tx) } };
  vm.runInNewContext(js, {
    module, exports: module.exports, Buffer, Date, Error,
    require: id => id === '@/db' ? db
      : id === '@/lib/http' ? { HttpError: class HttpError extends Error {} }
      : id === '@/lib/manualBackupFormat' ? { packManualBackup, MANUAL_BACKUP_FORMAT }
      : require(id),
  });
  const output = await module.exports.createManualBackup();
  assert.match(output.filename, /^DM-Events-Backup-/);
  assert.equal(output.summary.tables, 2);
  assert.equal(output.summary.rows, 2);
  const data = unpackManualBackup(output.archive);
  assert.equal(data.tables[0].name, 'users');
  assert.ok(data.tables[1].rows[0].includes('9007199254740993.99'));
  assert.ok(queries.some(entry => entry.query.includes('REPEATABLE READ, READ ONLY')));
});
