const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

test('all new backup + export TypeScript files parse successfully', () => {
  const files = [
    'src/lib/backup.ts','src/lib/backup-dispatch.ts','src/lib/analyticsCsv.ts',
    'app/api/backups/route.ts','app/api/report.csv/route.ts','app/api/cron/backup/route.ts',
    'scripts/backup.ts','scripts/restore.ts','scripts/verify-backup.ts',
    'src/components/admin/Analytics.tsx','src/components/admin/Backups.tsx',
  ];
  for (const file of files) {
    const output = ts.transpileModule(source(file), { fileName:file, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics:true });
    assert.deepEqual((output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[],file);
  }
});

test('R2 backup is authenticated and never generates plaintext object or claims success at dispatch', () => {
  const lib=source('src/lib/backup.ts'), route=source('app/api/backups/route.ts');
  assert.match(lib,/aes-256-gcm/);
  assert.match(lib,/pg_dump/);
  assert.match(lib,/HeadObjectCommand/);
  assert.match(lib,/PGDMP/);
  assert.match(route,/requirePermission\('backups.manage'\)/);
  assert.match(route,/status: 'QUEUED'/);
  assert.match(route,/202/);
  assert.doesNotMatch(route,/createBackup\(/);
  assert.match(source('scripts/verify-backup.ts'),/pg_restore/);
  assert.match(source('.github/workflows/dm-events-r2-backup.yml'),/schedule:/);
});

test('report CSV has summary, monthly trend, event types and detailed rows and handles formula injection',()=>{
  const output=ts.transpileModule(source('src/lib/analyticsCsv.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};const module={exports};
  vm.runInNewContext(output,{module,exports,Intl,Date,Number,String,Map});
  const {buildAnalyticsCsv,csvCell,phMonth}=module.exports;
  assert.equal(csvCell('  =IMPORTXML(1)'), '\"\'  =IMPORTXML(1)\"');
  assert.equal(phMonth(new Date('2026-07-31T17:00:00.000Z')),'2026-08');
  const result=buildAnalyticsCsv({
    exportedAt:new Date('2026-10-30T07:00:00Z'),month:'2026-08',movementType:'ALL',
    monthly:[{month:'2026-08',amount:'75000',gross:'80000',reductions:'5000',count:1}],
    movements:[
      {reference:'DM-101',eventType:'Wedding',eventDate:'2026-11-01',recordedAt:new Date('2026-07-31T17:00:00Z'),movementType:'CONFIRMATION',delta:'80000.00',after:'80000.00',note:'Confirmed'},
      {reference:'DM-101',eventType:'Wedding',eventDate:'2026-11-01',recordedAt:new Date('2026-08-12T03:00:00Z'),movementType:'ADJUSTMENT',delta:'-5000.00',after:'75000.00',note:'Reduced'},
    ],
  });
  for(const label of ['SUMMARY - SELECTED PERIOD AND FILTER','MONTHLY TREND','EVENT TYPE BREAKDOWN','BOOKING MOVEMENTS','75000.00','DM-101','Booking commitments'])assert.ok(result.includes(label),label);
  assert.equal(result.charCodeAt(0),0xfeff);
  assert.match(source('app/api/report.csv/route.ts'),/analytics.export/);
  assert.match(source('src/components/admin/Analytics.tsx'),/Export selected report CSV/);
});
