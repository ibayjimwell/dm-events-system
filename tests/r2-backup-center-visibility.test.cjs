const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const get = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const changes = [
  'app/(portal)/admin/maintenance/backups/page.tsx',
  'app/(portal)/admin/maintenance/page.tsx',
  'src/components/admin/Backups.tsx',
  'src/components/admin/BackupSettings.tsx',
  'src/components/shared/SiteNav.tsx',
  'app/api/backups/route.ts',
  'src/lib/backup-dispatch.ts',
];

test('every changed TypeScript and TSX file parses', () => {
  for (const name of changes) {
    const result = ts.transpileModule(get(name), {
      fileName: name,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
    });
    assert.equal(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length || 0, 0, name);
  }
});

test('backup page exists and has server permission guard', () => {
  const source = get('app/(portal)/admin/maintenance/backups/page.tsx');
  assert.match(source, /pagePermission\('backups\.manage'\)/);
  assert.match(source, /<Backups\s*\/>/);
});

test('Administrator sees Backups in main navbar; Coordinator modules are permission-filtered', () => {
  const source = get('src/components/shared/SiteNav.tsx');
  assert.match(source, /label: 'Backups', icon: DatabaseBackup, permission: 'backups\.manage'/);
  assert.match(source, /adminLinks: NavItem\[\]/);
  assert.match(source, /visible\(\[\.\.\.extraAdminLinks, \.\.\.maintenanceLinks\]\)/);
  assert.match(source, /allowed\.has\(item\.permission\)/);
});

test('Maintenance landing offers a prominent backup access link', () => {
  const source = get('app/(portal)/admin/maintenance/page.tsx');
  assert.match(source, /BACKUP CENTER/);
  assert.match(source, /Open R2 Backup Center/);
  assert.match(source, /allowed\.has\('backups\.manage'\)/);
});

test('backup page visibly renders queue control, diagnostics, and statuses', () => {
  const source = get('src/components/admin/Backups.tsx');
  for (const phrase of [
    'Queue R2 backup',
    'Checking the runner connection',
    'Connect the GitHub Actions runner',
    'missingConfiguration',
    'data-dm-backup-center="r2-v2"',
    "['QUEUED', 'RUNNING']",
    'npm run restore',
  ]) assert.ok(source.includes(phrase), phrase);
  assert.match(source, /disabled=\{!canQueue\}/);
});

test('backup API reveals missing variable names only and keeps server-side authorization', () => {
  const route = get('app/api/backups/route.ts');
  const dispatch = get('src/lib/backup-dispatch.ts');
  assert.match(route, /requirePermission\('backups\.manage'\)/);
  assert.match(route, /missingConfiguration: backupDispatchMissing\(\)/);
  assert.match(dispatch, /runnerVariables\.filter\(name => !process\.env\[name\]/);
  assert.match(dispatch, /response\.status !== 204/);
  assert.doesNotMatch(route, /BACKUP_GITHUB_TOKEN\s*:/);
});
