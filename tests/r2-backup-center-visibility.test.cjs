const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const get = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const changes = [
  'app/(portal)/admin/maintenance/backups/page.tsx',
  'app/(portal)/admin/maintenance/settings/page.tsx',
  'src/components/admin/SettingsHub.tsx',
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

test('old Backups route redirects to the existing System Settings page', () => {
  const source = get('app/(portal)/admin/maintenance/backups/page.tsx');
  assert.match(source, /redirect\('\/admin\/maintenance\/settings\?tab=backups'\)/);
  const config = get('next.config.ts');
  assert.match(config, /source: '\/admin\/maintenance\/backups'/);
  assert.match(config, /destination: '\/admin\/maintenance\/settings\?tab=backups'/);
});

test('Backups is in More, not the Administrator main navbar', () => {
  const source = get('src/components/shared/SiteNav.tsx');
  const mainNav = source.slice(source.indexOf('const adminLinks:'), source.indexOf('const maintenanceLinks:'));
  assert.doesNotMatch(mainNav, /Backups|backups\.manage/);
  assert.match(source, /label: 'Cloudflare R2 Backups', icon: DatabaseBackup, permission: 'backups\.manage'/);
  assert.match(source, /items: visible\(maintenanceLinks\)/);
  assert.match(source, /allowed\.has\(item\.permission\)/);
});

test('System Settings page renders secure embedded tabs', () => {
  const page = get('app/(portal)/admin/maintenance/settings/page.tsx');
  const hub = get('src/components/admin/SettingsHub.tsx');
  assert.match(page, /permissionSet\(user\)/);
  assert.match(page, /canSettings = permissions\.has\('settings\.manage'\)/);
  assert.match(page, /canBackups = permissions\.has\('backups\.manage'\)/);
  assert.match(page, /<SettingsHub/);
  assert.match(hub, /role="tablist"/);
  assert.match(hub, /<Backups canSettings=\{canSettings\}/);
  assert.match(hub, /window\.history\.pushState/);
});

test('Maintenance and overview point to Settings Backups tab, not legacy URL', () => {
  for (const file of ['app/(portal)/admin/maintenance/page.tsx','src/components/admin/Overview.tsx','src/components/admin/BackupSettings.tsx']) {
    const source = get(file);
    assert.match(source, /\/admin\/maintenance\/settings\?tab=backups/);
    assert.doesNotMatch(source, /href=["']\/admin\/maintenance\/backups/);
  }
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
