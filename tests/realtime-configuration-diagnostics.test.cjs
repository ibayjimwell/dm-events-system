const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function jsModule(file, imports) {
  const compiled = ts.transpileModule(read(file), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(imports, module, module.exports);
  return module.exports;
}

test('an opened HTTP stream is not misreported as a subscribed database connection', () => {
  const previous = { EventSource: global.EventSource, window: global.window, document: global.document };
  const sources = [];
  class FakeEventSource {
    static CLOSED = 2;
    constructor() { this.events = new Map(); this.readyState = 1; sources.push(this); }
    addEventListener(kind, cb) { this.events.set(kind, [...(this.events.get(kind) || []), cb]); }
    emit(kind, data) { for (const fn of this.events.get(kind) || []) fn({ data: JSON.stringify(data) }); }
    close() { this.readyState = 2; }
  }
  global.EventSource = FakeEventSource;
  global.window = {};
  global.document = { visibilityState: 'visible' };
  try {
    const bus = jsModule('src/connection/events.ts', mod => {
      assert.equal(mod, '@/lib/query-cache');
      return { invalidateQuerySnapshots() {} };
    });
    const observed = [];
    const unsubscribe = bus.subscribeToChatEvents(event => observed.push(event.kind));
    sources[0].emit('open');
    assert.deepEqual(observed, []);
    sources[0].emit('chat', { kind: 'sync' });
    assert.deepEqual(observed, ['sync']);
    sources[0].emit('status', { kind: 'connected' });
    assert.deepEqual(observed, ['sync', 'connected']);
    sources[0].emit('status', { kind: 'disconnected' });
    assert.deepEqual(observed, ['sync', 'connected', 'disconnected']);
    unsubscribe(); bus.closeLiveEvents();
  } finally {
    global.EventSource = previous.EventSource;
    global.window = previous.window;
    global.document = previous.document;
  }
});

test('health endpoint requires an admin with settings permission; does not return credentials', () => {
  const health = read('app/api/events/health/route.ts');
  assert.match(health, /await requireActor\(\)/);
  assert.match(health, /user\.role !== 'ADMIN'/);
  assert.match(health, /await can\(user, 'settings\.manage'\)/);
  assert.match(health, /pg_publication_tables/);
  assert.match(health, /projectReferencesMatch/);
  assert.match(health, /probeChannel/);
  assert.match(health, /removeChannel\(channel\)/);
  assert.doesNotMatch(health, /return ok\(\{[\s\S]*process\.env\.SUPABASE_SERVICE_ROLE_KEY[,\s]*\}/);
});

test('the patch has an idempotent publication setup for all messaging tables', () => {
  const sql = read('supabase/enable-realtime.sql');
  for (const table of ['messages','message_reads','message_typing','message_thread_preferences','message_thread_deletions','bookings']) {
    assert.ok(sql.includes(`'${table}'`));
  }
  assert.match(sql, /IF NOT EXISTS[\s\S]*pg_publication_tables/);
  assert.match(sql, /ADD TABLE/);
  assert.doesNotMatch(sql, /GRANT (SELECT|ALL) .* TO anon/i);
});

test('DELETE events without a booking id cause a permission-safe resync', () => {
  const bridge = read('src/connection/bridge.ts');
  assert.match(bridge, /payload\.eventType === 'DELETE'/);
  assert.match(bridge, /if \(canChat\) write\('chat', \{ kind: 'sync' \}\)/);
  assert.match(bridge, /status === 'SUBSCRIBED'/);
  assert.match(bridge, /write\('status', \{ kind: 'connected' \}\)/);
});
