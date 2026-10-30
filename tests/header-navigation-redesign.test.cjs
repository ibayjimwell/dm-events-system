const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8');

const nav = read('src/components/shared/SiteNav.tsx');
const css = read('src/components/shared/SiteNav.module.css');

test('new header parses as a complete client component', () => {
  const result = ts.transpileModule(nav, {fileName:'SiteNav.tsx', reportDiagnostics: true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
  assert.equal((result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  assert.match(nav, /^'use client';/);
  assert.match(nav, /from '\.\/SiteNav\.module\.css'/);
});

test('all role menus remain permission-filtered, including delegated modules', () => {
  for (const text of ['publicLinks', 'clientLinks', 'coordinatorLinks', 'adminLinks','maintenanceLinks','extraAdminLinks','extraOperationsLinks']) assert.ok(nav.includes(text));
  assert.match(nav, /allowed\.has\(item\.permission\)/);
  assert.match(nav, /role === 'ADMIN'/);
  assert.match(nav, /bookings\.create\.walkin/);
  assert.match(nav, /role === 'CLIENT' \? '\/client'/);
});

test('active navigation does not highlight root dashboard and More together', () => {
  assert.match(nav, /dashboardRoots\.has\(path\)/);
  assert.match(nav, /const settingsActive = !primaryActive/);
  assert.match(nav, /aria-current=\{active \? 'page'/);
});

test('messaging route prefetch stays disabled and fullscreen chat wrapper stays untouched', () => {
  assert.match(nav, /prefetch=\{false\}/);
  assert.match(read('src/components/shared/PortalMessengerFrame.tsx'), /if \(inMessenger\)/);
  assert.match(read('src/components/shared/PortalMessengerFrame.tsx'), /<SiteNav role=\{role\}/);
});

test('mobile overlay is dismissible, body scroll is locked, keyboard focus is managed', () => {
  assert.match(nav, /aria-modal="true"/);
  assert.match(nav, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(nav, /event\.key === 'Escape'/);
  assert.match(nav, /event\.key === 'Tab'/);
  assert.match(nav, /setMobileOpen\(false\)/);
  assert.match(css, /@media \(max-width: 1200px\)/);
  assert.match(css, /overscroll-behavior: contain/);
});

test('signout errors are handled without navigating on failed POST', () => {
  assert.match(nav, /response\.ok/);
  assert.match(nav, /setLogoutError\(/);
  assert.match(nav, /router\.replace\(role === 'CLIENT' \|\| role === 'PUBLIC'/);
  assert.match(nav, /finally \{/);
});
