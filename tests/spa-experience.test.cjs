const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');

const files = [
  'src/lib/query-cache.ts', 'src/hooks/useLiveQuery.ts', 'src/api-client/http.ts',
  'src/lib/auth.ts','src/lib/access.ts','src/lib/live-events.ts',
  'src/components/shared/SiteNav.tsx', 'src/components/shared/MessagesPanel.tsx',
  'src/components/ui/LoadingSkeleton.tsx',
];

test('all SPA infrastructure parses as TypeScript or TSX', () => {
  for (const file of files) {
    const result = ts.transpileModule(src(file), {fileName:file, reportDiagnostics:true,
      compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
    assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file);
  }
});

test('top-level network progress removed, contextual loading remains', () => {
  assert.doesNotMatch(src('app/layout.tsx'), /GlobalNetworkSkeleton/);
  assert.match(src('src/components/ui/LoadingSkeleton.tsx'), /RouteSkeleton/);
  assert.match(src('src/components/ui/LoadingSkeleton.tsx'), /animate-pulse/);
});

test('route links warm on hover and keyboard focus without full-viewport prefetch', () => {
  const nav = src('src/components/shared/SiteNav.tsx');
  assert.match(nav, /prefetch=\{intent \? null : false\}/);
  assert.match(nav, /onMouseEnter=\{event => \{ setIntent\(true\)/);
  assert.match(nav, /onFocus=\{event => \{ setIntent\(true\)/);
  assert.match(nav, /if \(pathname === item\.href\) event\.preventDefault\(\)/);
});

test('private cached API responses are ephemeral and invalidated after mutations', () => {
  const cache = src('src/lib/query-cache.ts');
  assert.match(cache,/MAX_ENTRIES = 80/);
  assert.match(cache,/snapshots.clear\(\)/);
  assert.doesNotMatch(cache,/localStorage|sessionStorage|indexedDB/);
  assert.match(src('src/api-client/http.ts'),/invalidateQuerySnapshots\(\)/);
  assert.match(src('src/components/shared/SiteNav.tsx'),/invalidateQuerySnapshots\(\)/);
});

test('pages return cached data immediately and use background refreshes', () => {
  const hook = src('src/hooks/useLiveQuery.ts');
  assert.match(hook,/readQuerySnapshot/);
  assert.match(hook,/writeQuerySnapshot/);
  assert.match(hook,/refreshing/);
  assert.match(hook,/shown = resolvedKey === key/);
  assert.match(hook,/subscribeToLiveChanges/);
  for (const file of [
    'src/components/admin/Overview.tsx','src/components/admin/Analytics.tsx',
    'src/components/client/BookingList.tsx','src/components/client/Profile.tsx',
    'src/components/coordinator/Calendar.tsx','src/components/coordinator/RequestList.tsx',
  ]) assert.match(src(file), /cacheKey:/, file);
});

test('messaging is optimistic, retains draft on failure and does not refetch after send', () => {
  const chat = src('src/components/shared/MessagesPanel.tsx');
  const send = chat.split('  async function send(event?: FormEvent) {')[1].split('  function handleKey(')[0];
  assert.match(send, /setOptimistic\(prev => \[\.\.\.prev, optimisticMessage\]\)/);
  assert.match(send,/conversation\.setData/);
  assert.match(send,/all\.setData/);
  assert.match(send,/Your draft was restored/);
  assert.doesNotMatch(send,/await Promise\.all\(\[conversation\.refresh\(\), all\.refresh\(\)\]\)/);
  assert.match(chat,/Sending…/);
  assert.match(chat,/if \(!othersTyping\) return/);
});

test('authentication and RBAC stay server-enforced with request-scoped memoization', () => {
  assert.match(src('src/lib/auth.ts'),/export const actor = cache\(/);
  assert.match(src('src/lib/access.ts'),/const coordinatorOverrides = cache\(/);
  for (const file of ['app/(portal)/admin/layout.tsx','app/(portal)/coordinator/layout.tsx','app/(portal)/client/layout.tsx']) {
    assert.match(src(file),/await actor\(\)/);
  }
  assert.match(src('app/api/messages/route.ts'), /requireActor\(/);
  assert.match(src('app/api/messages/route.ts'), /readBooking\(/);
  assert.match(src('app/api/messages/route.ts'), /after\(async \(\) =>/);
  assert.match(src('app/api/messages/route.ts'), /return ok\(\{ message: m \}, 201\)/);
});
