const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
const read = file => readFileSync(join(__dirname, '..', file), 'utf8');

const files = [
  'app/api/events/route.ts',
  'app/(portal)/admin/layout.tsx',
  'src/hooks/useLiveQuery.ts',
  'src/components/shared/MessagesPanel.tsx',
  'src/components/shared/SiteNav.tsx',
];

test('changed messaging and portal files parse as complete TypeScript', () => {
  for (const file of files) {
    const parsed = ts.transpileModule(read(file), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX},
    });
    const errors = (parsed.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${file}: ${errors.map(e => e.messageText).join('; ')}`);
  }
});

test('chat opts out of generic subscriptions and uses only scoped message/read events', () => {
  const chat = read('src/components/shared/MessagesPanel.tsx');
  assert.equal((chat.match(/subscribeToChatEvents\(/g) ?? []).length, 1);
  assert.equal((chat.match(/subscribeToChanges: false/g) ?? []).length, 2);
  assert.equal((chat.match(/refreshOnFocus: false/g) ?? []).length, 2);
  assert.match(chat, /event\.kind === 'message' \|\| event\.kind === 'read'/);
  assert.match(chat, /event\.bookingId === selected/);
  assert.match(chat, /refreshTimerRef/);
  assert.match(chat, /30_000/);
});

test('general queries keep default live invalidation and request safety', () => {
  const hook = read('src/hooks/useLiveQuery.ts');
  assert.match(hook, /options\.subscribeToChanges !== false/);
  assert.match(hook, /options\.refreshOnFocus !== false/);
  assert.match(hook, /subscribeToLiveChanges\(/);
  assert.match(hook, /\+\+sequence\.current/);
  assert.match(hook, /requestId === sequence\.current/);
});

test('opening a Supabase stream does not masquerade as a database mutation', () => {
  const server = read('app/api/events/route.ts');
  assert.doesNotMatch(server, /write\('change',\s*\{\s*kind:\s*'connected'/);
  assert.match(server, /postgres_changes/);
  assert.match(server, /kind: 'typing'/);
  assert.match(server, /kind: 'read'/);
});

test('admin layout imports its messenger frame and chat links cannot automatically prefetch the same RSC route', () => {
  const layout = read('app/(portal)/admin/layout.tsx');
  assert.match(layout, /import PortalMessengerFrame from/);
  assert.match(layout, /<PortalMessengerFrame/);
  const nav = read('src/components/shared/SiteNav.tsx');
  assert.match(nav, /prefetch=\{item\.href\.endsWith\('\/messages'\) \? false/);
});
