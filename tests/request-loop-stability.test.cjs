const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
const read = p => readFileSync(join(__dirname, '..', p), 'utf8');

function loadPureModule(file) {
  const source = read(file);
  const output = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `${file}: syntax errors`);
  const module = { exports: {} };
  new Function('module', 'exports', output.outputText)(module, module.exports);
  return module.exports;
}

const guards = loadPureModule('src/lib/query-invalidation.ts');

test('dashboard invalidation ignores unrelated site and package writes', () => {
  const key = 'bookings|booking_history|messages';
  assert.equal(guards.shouldInvalidateForKind('site_content', key), false);
  assert.equal(guards.shouldInvalidateForKind('packages', key), false);
  assert.equal(guards.shouldInvalidateForKind('messages', key), true);
  assert.equal(guards.shouldInvalidateForKind('bookings', key), true);
  assert.equal(guards.shouldInvalidateForKind(undefined, key), true);
  assert.equal(guards.shouldInvalidateForKind('site_content', ''), true);
});

test('focus refresh throttles bursts but allows later refreshes', () => {
  assert.equal(guards.isFocusRefreshDue(1_000, 1_000), false);
  assert.equal(guards.isFocusRefreshDue(30_999, 1_000), false);
  assert.equal(guards.isFocusRefreshDue(31_000, 1_000), true);
});

test('navbar does not automatically prefetch dynamic portal routes', () => {
  const nav = read('src/components/shared/SiteNav.tsx');
  // Every Next Link in this component explicitly disables background prefetching.
  assert.equal((nav.match(/<Link\b/g) ?? []).length, (nav.match(/prefetch=\{false\}/g) ?? []).length);
  assert.match(nav, /<Link href=\{portalHome\} prefetch=\{false\}/);
  assert.match(nav, /onClick=\{signOut\}/);
  assert.equal((nav.match(/router\.refresh\(\)/g) ?? []).length, 1); // only signout may refresh
  assert.match(nav, /if \(pathname === item\.href\) event\.preventDefault\(\)/);
});

test('dashboard live query batches and ignores unrelated change events', () => {
  const hook = read('src/hooks/useLiveQuery.ts');
  const overview = read('src/components/admin/Overview.tsx');
  const live = read('src/lib/live-events.ts');
  assert.match(hook, /shouldInvalidateForKind\(kind, kinds\)/);
  assert.match(hook, /setTimeout\(\(\) => void refresh\(\), 650\)/);
  assert.match(hook, /pendingRealtimeRefresh\.current/);
  assert.match(overview, /realtimeKinds:\['bookings','booking_history','messages','message_reads','booking_value_events'\]/);
  assert.match(live, /listeners\.forEach\(fn => fn\(kind\)\)/);
});
