const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const get = name => fs.readFileSync(path.join(root, name), 'utf8');

test('managed backup UI and API TypeScript parse', () => {
  for (const name of [
    'src/components/admin/Backups.tsx', 'src/components/admin/BackupSettings.tsx',
    'src/components/admin/SettingsHub.tsx', 'app/api/backups/route.ts',
    'src/lib/manualBackup.ts', 'src/lib/manualBackupFormat.ts',
    'src/lib/managedBackupStore.ts', 'src/lib/managedBackupCrypto.ts',
    'app/api/backups/file/route.ts', 'app/api/cron/daily-backup/route.ts',
  ]) {
    const result = ts.transpileModule(get(name), { fileName: name, reportDiagnostics: true, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
    } });
    assert.equal(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length || 0, 0, name);
  }
});

test('backup remains permission gated, embedded inside Settings and linked from Maintenance', () => {
  const page = get('app/(portal)/admin/maintenance/settings/page.tsx');
  const hub = get('src/components/admin/SettingsHub.tsx');
  const menu = get('src/components/shared/SiteNav.tsx');
  const maintenance = get('app/(portal)/admin/maintenance/page.tsx');
  assert.match(page, /canBackups = permissions\.has\('backups\.manage'\)/);
  assert.match(page, /<SettingsHub/);
  assert.match(hub, /<Backups canSettings=\{canSettings\}/);
  assert.match(menu, /label: 'Backup Center', icon: DatabaseBackup, permission: 'backups\.manage'/);
  assert.match(maintenance, /Backup Center/);
});

test('automatic backup policy and history controls are visible', () => {
  const settings = get('src/components/admin/BackupSettings.tsx');
  const ui = get('src/components/admin/Backups.tsx');
  assert.match(settings, /Automatic backup policy/);
  assert.match(settings, /seven successful automatic snapshots/);
  assert.match(ui, /Backup history/);
  assert.match(ui, /Create backup/);
  assert.match(ui, /action=inspect/);
  assert.doesNotMatch(settings, /GitHub Actions runner|Cloudflare R2 key/);
});
