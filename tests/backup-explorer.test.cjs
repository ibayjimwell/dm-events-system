const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const file = 'src/lib/backupExplorer.ts';
const moduleObj = { exports: {} };
vm.runInNewContext(ts.transpileModule(read(file), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleObj, exports: moduleObj.exports, console, Date, Intl }, { filename: file });
const { summarizeBackup, previewBackupTable, backupTableDetails } = moduleObj.exports;
function t(name, rows) { return { name, columns: Object.keys(rows[0] || { id: '' }), rows: rows.map(row => JSON.stringify(row)) }; }
const snapshot = {
  format: 'dm-events-public-data-v1', exportedAt: '2026-11-05T03:28:43.843Z', schema: 'public', sha256: 'a'.repeat(64),
  tables: [
    t('bookings', [
      { reference:'DEM-001', status:'CONFIRMED', event_type:'Wedding', event_date:'2026-12-01', source:'ONLINE', booked_value:'10000.00', contact_email:'secret@private.test', contact_name:'Private Customer', estimated_budget:'10000', venue:'San Fernando' },
      { reference:'DEM-002', status:'COMPLETED', event_type:'Birthday', event_date:'2026-10-01', source:'WALK_IN', booked_value:'6000.00', contact_email:'another@private.test' },
      { reference:'DEM-003', status:'CANCELLED', event_type:'Wedding', event_date:'2026-09-01', source:'ONLINE', booked_value:'8000.00' },
    ]),
    t('booking_value_events', [
      { amount_delta:'10000.00', event_type:'CONFIRMATION', value_after:'10000.00' },
      { amount_delta:'-2000.00', event_type:'REVERSAL', value_after:'8000.00' },
    ]),
    t('users', [
      { full_name:'Admin Test', email:'root@example.com', role:'ADMIN', password_hash:'secrethash', is_active: true },
      { full_name:'Client Test', role:'CLIENT', password_hash:'anotherhash', is_active: true },
    ]),
    t('packages', [{ name:'Gold Wedding', published:true }, { name:'Private package', published:false }]),
    t('booking_service_feedback', [{ rating:5, public_consent_at:'2026-11-04T00:00:00Z' }, { rating:3, public_consent_at:null }]),
    t('messages', [{ booking_id:'xyz', body:'private chat', created_at:'2026-11-01' }]),
    t('sessions', [{ id:'s1', token_hash:'NEVER_SEND_THIS' }]),
    t('system_settings', [{ id:'main', secret:'DO_NOT_LEAK' }]),
    t('unknown_table', [{ password: 'NEW_SECRET' }]),
  ],
};
snapshot.tableCount = snapshot.tables.length;
snapshot.rowCount = snapshot.tables.reduce((s, table) => s + table.rows.length, 0);

test('backup overview has useful operational snapshot without inventing income', () => {
  const report = summarizeBackup(snapshot, 'DM-Events-Backup.json.gz');
  assert.equal(report.verified, true);
  assert.equal(report.rows, snapshot.rowCount);
  assert.equal(report.bookings.total, 3);
  assert.equal(report.bookings.upcomingConfirmed, 1);
  assert.equal(report.finance.currentConfirmedValue, 16000);
  assert.equal(report.finance.positiveMovements, 10000);
  assert.equal(report.finance.negativeMovements, 2000);
  assert.equal(report.finance.netMovements, 8000);
  assert.equal(report.packages.published, 1);
  assert.equal(report.feedback.averageRating, 4);
  assert.equal(report.feedback.publicReviews, 1);
  assert.equal(report.accounts.total, 2);
  assert.equal(report.communications.messages, 1);
  assert.ok(report.warnings.some(w => /restor/i.test(w)));
});

test('booking preview offers actual booking information and never contact details', () => {
  const result = previewBackupTable(snapshot, 'bookings', 0, 20, 'Wedding');
  assert.equal(result.matchedRows, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].reference, 'DEM-001');
  assert.equal(result.rows[0].event_type, 'Wedding');
  assert.ok(!result.columns.includes('contact_email'));
  assert.ok(result.columns.includes('contact_name')); // Authorized backup managers can identify event bookings.
  assert.ok(!JSON.stringify(result).includes('secret@private.test'));
});

test('users, messages and restricted tables never return secrets', () => {
  const userPreview = previewBackupTable(snapshot, 'users', 0, 20);
  const messagePreview = previewBackupTable(snapshot, 'messages', 0, 20);
  const sessionPreview = previewBackupTable(snapshot, 'sessions', 0, 20);
  const unknownPreview = previewBackupTable(snapshot, 'unknown_table', 0, 20);
  assert.equal(userPreview.rows[0].full_name, 'Admin Test');
  assert.ok(!JSON.stringify(userPreview).includes('secrethash'));
  assert.ok(!JSON.stringify(userPreview).includes('root@example.com'));
  assert.ok(!JSON.stringify(messagePreview).includes('private chat'));
  assert.equal(sessionPreview.previewable, false);
  assert.equal(sessionPreview.rows.length, 0);
  assert.equal(unknownPreview.previewable, false);
  assert.ok(!JSON.stringify(unknownPreview).includes('NEW_SECRET'));
});

test('pagination/search apply only to allowed values', () => {
  const many = { ...snapshot, tables: [t('bookings', Array.from({length:41},(_,i) => ({ reference:`DEM-${String(i).padStart(3,'0')}`,status:'CONFIRMED',contact_email:'hidden@example.com'}))) ] };
  const next = previewBackupTable(many, 'bookings', 20, 20);
  assert.equal(next.rows.length, 20);
  assert.equal(next.rows[0].reference, 'DEM-020');
  assert.equal(previewBackupTable(many, 'bookings', 40, 20).rows.length, 1);
  assert.equal(previewBackupTable(many, 'bookings', 0, 20, 'hidden@example.com').matchedRows, 0);
  assert.equal(previewBackupTable(many, 'bookings', 0, 20, 'DEM-030').matchedRows, 1);
  assert.throws(() => previewBackupTable(many, 'bookings', -1, 20), /offset/);
  assert.throws(() => previewBackupTable(many, 'bookings', 0, 200), /size/);
  assert.throws(() => previewBackupTable(many, 'other', 0, 20), /does not exist/);
  assert.throws(() => previewBackupTable(many, 'bookings', 0, 20, 'x'.repeat(101)), /100/);
});

test('route enforces permission, validates action and uses verified stored snapshots', () => {
  const source = read('app/api/backups/file/route.ts');
  assert.match(source, /requirePermission\('backups\.manage'\)/);
  assert.match(source, /readStoredBackup\(pathFrom\(req\)\)/);
  assert.match(source, /action === 'inspect'/);
  assert.match(source, /action === 'records'/);
  assert.match(source, /previewBackupTable\(payload/);
  assert.match(source, /'Cache-Control': 'private, no-store, max-age=0'/);
});

test('Backup Center opens real explorer and keeps existing download/delete management', () => {
  const screen = read('src/components/admin/Backups.tsx');
  const explorer = read('src/components/admin/BackupExplorer.tsx');
  assert.match(screen, /<BackupExplorer/);
  assert.match(screen, /onDownload=\{\(\) => downloadBackup/);
  assert.match(screen, /deleteBackup\(entry\)/);
  assert.match(explorer, /role="dialog" aria-modal="true"/);
  assert.match(explorer, /section === 'records'/);
  assert.match(explorer, /action: 'records'/);
  assert.match(explorer, /No live database changes/i);
});

test('new files parse as TypeScript/TSX', () => {
  for (const name of [file, 'src/components/admin/BackupExplorer.tsx', 'src/components/admin/Backups.tsx', 'app/api/backups/file/route.ts']) {
    const tree = ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true, name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.equal(tree.parseDiagnostics.length, 0, name);
  }
});

test('protected API returns a bounded record page and never sends session contents', async () => {
  const routeSource = read('app/api/backups/file/route.ts');
  const js = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const endpoint = { exports: {} };
  let allow = false;
  let reads = 0;
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  vm.runInNewContext(js, {
    module: endpoint, exports: endpoint.exports, URL, Buffer, Uint8Array, Response, console,
    require: id => {
      if (id === '@/lib/access') return { requirePermission: async () => { if (!allow) throw new HttpError(403, 'denied'); return { id: 'a' }; } };
      if (id === '@/lib/http') return { route: fn => fn, ok: data => Response.json(data), HttpError };
      if (id === '@/lib/auth') return { audit: async () => {} };
      if (id === '@/lib/managedBackupStore') return {
        readStoredBackup: async () => { reads++; return { archive: Buffer.from('gzip'), payload: snapshot, filename: 'safe.json.gz' }; },
      };
      if (id === '@/lib/backupExplorer') return { previewBackupTable, summarizeBackup };
      throw Error('Unexpected import ' + id);
    },
  }, { filename: 'app/api/backups/file/route.ts' });
  const url = action => new Request('https://dm.local/api/backups/file?path=manual/demo.json.gz.enc&' + action);
  await assert.rejects(endpoint.exports.GET(url('action=inspect')), /denied/);
  assert.equal(reads, 0);
  allow = true;
  const summary = await (await endpoint.exports.GET(url('action=inspect'))).json();
  assert.equal(summary.bookings.total, 3);
  assert.ok(!JSON.stringify(summary).includes('secrethash'));
  const records = await (await endpoint.exports.GET(url('action=records&table=bookings&limit=1&offset=1'))).json();
  assert.equal(records.rows.length, 1);
  assert.equal(records.rows[0].reference, 'DEM-002');
  assert.ok(!JSON.stringify(records).includes('another@private.test'));
  const locked = await (await endpoint.exports.GET(url('action=records&table=sessions'))).json();
  assert.equal(locked.previewable, false);
  assert.ok(!JSON.stringify(locked).includes('NEVER_SEND_THIS'));
  await assert.rejects(endpoint.exports.GET(url('action=records&table=bookings&limit=99')), /Invalid backup preview/);
});
