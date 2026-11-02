const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const src = (path) => fs.readFileSync(path, 'utf8');

const changed = [
  'src/components/admin/UsersEditor.tsx',
  'src/lib/access.ts',
  'app/(portal)/admin/layout.tsx',
  'app/(portal)/coordinator/layout.tsx',
  'app/(portal)/client/layout.tsx',
  'app/(portal)/admin/maintenance/page.tsx',
  'app/(portal)/admin/maintenance/settings/page.tsx',
  'app/access-denied/page.tsx',
];

test('all changed UI and server files transpile without TypeScript syntax errors', () => {
  for (const file of changed) {
    const result = ts.transpileModule(src(file), {
      fileName: file,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), [], file);
  }
});

test('Create account password has an accessible show/hide control without affecting form submission', () => {
  const ui = src('src/components/admin/UsersEditor.tsx');
  assert.match(ui, /Eye, EyeOff/);
  assert.match(ui, /const \[showPassword, setShowPassword\] = useState\(false\)/);
  assert.match(ui, /type=\{showPassword \? 'text' : 'password'\}/);
  assert.match(ui, /type="button"[\s\S]*?onClick=\{\(\) => setShowPassword\(value => !value\)\}/);
  assert.match(ui, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
  assert.match(ui, /aria-pressed=\{showPassword\}/);
  assert.match(ui, /aria-controls="new-user-password"/);
  assert.match(ui, /setPassword\(''\);\s*setShowPassword\(false\)/);
  assert.match(ui, /minLength=\{12\}/);
});

test('server page permissions redirect to an access-denied page rather than pretend route is missing', () => {
  const access = src('src/lib/access.ts');
  assert.match(access, /if \(!\(await can\(user, permission\)\)\) redirect\('\/access-denied'\)/);
  assert.doesNotMatch(access, /notFound\(/);
  assert.match(access, /throw new HttpError\(403/); // APIs still return real HTTP 403
});

test('role layouts deny unauthorized deep links and still require sign-in', () => {
  for (const path of [
    'app/(portal)/admin/layout.tsx',
    'app/(portal)/coordinator/layout.tsx',
    'app/(portal)/client/layout.tsx',
  ]) {
    const ui = src(path);
    assert.match(ui, /redirect\(['"]\/login['"]\)/, path);
    assert.match(ui, /redirect\(['"]\/access-denied['"]\)/, path);
  }
});

test('Administration hub and settings tabs never hide a forbidden page as a 404 or another section', () => {
  const maintenance = src('app/(portal)/admin/maintenance/page.tsx');
  const settings = src('app/(portal)/admin/maintenance/settings/page.tsx');
  assert.doesNotMatch(maintenance, /notFound\(/);
  assert.match(maintenance, /if \(!visible.length\) redirect\('\/access-denied'\)/);
  assert.match(settings, /if \(!canSettings && !canBackups\) redirect\('\/access-denied'\)/);
  assert.match(settings, /requested === 'backups' && !canBackups/);
  assert.match(settings, /requested === 'policy' && !canSettings/);
});

test('Access Denied page is authenticated and provides a safe destination', () => {
  const page = src('app/access-denied/page.tsx');
  assert.match(page, /if \(!user\) redirect\('\/login'\)/);
  assert.match(page, /const home = await portalHome\(user\)/);
  assert.match(page, /Access Denied/);
  assert.match(page, /You don&amp;apos;t have access|You don&apos;t have access/);
  assert.match(page, /href=\{home\}/);
  assert.match(src('app/(public)/packages/[id]/page.tsx'), /notFound\(/); // Unknown resources keep 404
});


test('Access Denied is a standalone route with no public navbar or footer', () => {
  assert.equal(fs.existsSync('app/(public)/access-denied/page.tsx'), false,
    'Old public route must be deleted to prevent duplicate /access-denied routes');
  const page = src('app/access-denied/page.tsx');
  assert.match(page, /min-h-screen/);
  assert.match(page, /Access Denied/);
  assert.match(page, /You don&apos;t have access to this section/);
  assert.match(page, />\s*Back\s*</);
  assert.doesNotMatch(page, /SiteNav|<Footer|PortalMessengerFrame/);
  const rootLayout = src('app/layout.tsx');
  assert.doesNotMatch(rootLayout, /SiteNav|<Footer|PortalMessengerFrame/);
  assert.match(src('app/(public)/layout.tsx'), /SiteNav/);
  assert.match(src('app/(public)/layout.tsx'), /<Footer/);
});
