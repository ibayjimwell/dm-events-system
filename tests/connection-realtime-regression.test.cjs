const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function loadModule(file, fakeRequire = () => { throw new Error(`Unexpected import from ${file}`); }) {
  const js = ts.transpileModule(read(file), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(js.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js.outputText)(fakeRequire, module, module.exports);
  return module.exports;
}

test('every changed messaging/connection file parses, including the thin HTTP adapter', () => {
  for (const file of [
    'app/api/events/route.ts', 'app/api/messages/threads/route.ts',
    'src/connection/server.ts', 'src/connection/bridge.ts',
    'src/connection/chat.ts', 'src/connection/events.ts', 'src/connection/typing.ts',
    'src/components/shared/MessagesPanel.tsx', 'src/models/messaging.ts',
    'src/hooks/useLiveQuery.ts', 'src/components/shared/SiteNav.tsx',
  ]) {
    const parsed = ts.transpileModule(read(file), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    assert.deepEqual(parsed.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), [], file);
  }
});

test('new empty conversations rank above inactive ones, and new messages move threads to top', () => {
  const { sortChatThreads, isActiveTyping } = loadModule('src/connection/chat.ts');
  const old = { id: '1', reference: 'OLD', createdAt: '2026-11-01T00:00:00Z', latest: { createdAt: '2026-11-02T00:00:00Z' } };
  const newBooking = { id: '2', reference: 'NEW', createdAt: '2026-11-20T00:00:00Z', latest: null };
  const threads = [old, newBooking];
  assert.deepEqual(sortChatThreads(threads).map(t => t.id), ['2', '1']);
  assert.deepEqual(threads.map(t => t.id), ['1', '2'], 'sort must not mutate UI or cache data');
  const replied = [{ ...old, latest: { createdAt: '2026-11-21T00:00:00Z' } }, newBooking];
  assert.deepEqual(sortChatThreads(replied).map(t => t.id), ['1', '2']);
  assert.equal(isActiveTyping('2026-11-20T00:00:06Z', Date.parse('2026-11-20T00:00:05Z')), true);
  assert.equal(isActiveTyping(Date.parse('2026-11-20T00:00:05Z'), Date.parse('2026-11-20T00:00:05Z')), false);
});

test('one browser EventSource fan-outs chat and general events, resyncing after reconnect', () => {
  const previous = { EventSource: global.EventSource, window: global.window, document: global.document };
  const instances = [];
  class FakeEventSource {
    static CLOSED = 2;
    constructor(url) { this.url = url; this.handlers = new Map(); this.readyState = 1; instances.push(this); }
    addEventListener(kind, fn) { this.handlers.set(kind, [...(this.handlers.get(kind) || []), fn]); }
    emit(kind, data) { (this.handlers.get(kind) || []).forEach(fn => fn({ data: JSON.stringify(data) })); }
    close() { this.readyState = 2; }
  }
  global.EventSource = FakeEventSource;
  global.window = {};
  global.document = { visibilityState: 'visible' };
  let invalidations = 0;
  try {
    const bus = loadModule('src/connection/events.ts', mod => {
      assert.equal(mod, '@/lib/query-cache');
      return { invalidateQuerySnapshots() { invalidations += 1; } };
    });
    const chatA = [];
    const chatB = [];
    const changes = [];
    const a = bus.subscribeToChatEvents(event => chatA.push(event.kind));
    const b = bus.subscribeToChatEvents(event => chatB.push(event.kind));
    const c = bus.subscribeToLiveChanges(kind => changes.push(kind));
    assert.equal(instances.length, 1);
    assert.equal(instances[0].url, '/api/events');
    instances[0].emit('open');
    assert.deepEqual(chatA, [], 'first connection does not cause a redundant refresh');
    instances[0].emit('chat', { kind: 'message', bookingId: '123' });
    assert.deepEqual(chatA, ['message']);
    assert.deepEqual(chatB, ['message']);
    instances[0].emit('chat', { kind: 'typing', bookingId: '123', userId: 'peer', typing: true });
    assert.equal(invalidations, 1, 'typing must not invalidate all queries');
    instances[0].emit('change', { kind: 'bookings' });
    assert.deepEqual(changes, ['bookings']);
    instances[0].emit('open');
    assert.deepEqual(chatA, ['message', 'typing', 'sync']);
    assert.deepEqual(changes, ['bookings', undefined]);
    a(); b(); c();
    bus.closeLiveEvents();
    assert.equal(instances[0].readyState, 2);
  } finally {
    global.EventSource = previous.EventSource;
    global.window = previous.window;
    global.document = previous.document;
  }
});

test('new booking, message, read, delete, archive, and typing are subscribed via Supabase WAL', () => {
  const bridge = read('src/connection/bridge.ts');
  for (const table of ['bookings', 'messages', 'message_reads', 'message_typing',
    'message_thread_preferences', 'message_thread_deletions']) {
    assert.ok(bridge.includes(table), `${table} is not subscribed`);
  }
  assert.match(bridge, /postgres_changes/);
  assert.match(bridge, /kind: 'thread'/);
  assert.match(bridge, /kind: 'typing'/);
  assert.match(bridge, /kind: 'sync'/);
  assert.match(bridge, /allowedChatBooking/);
  assert.match(bridge, /booking\?\.clientId === user\.id/);
  assert.match(bridge, /STREAM_LIFETIME_MS/);
  assert.match(bridge, /realtime\.removeChannel\(channel\)/);
  assert.doesNotMatch(bridge, /JSON\.stringify\(\s*row\s*\)/);
  assert.doesNotMatch(read('src/connection/events.ts'), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(read('src/connection/typing.ts'), /SUPABASE_SERVICE_ROLE_KEY/);
});

test('inbox and conversation handlers resync, display per-thread typing and newest-first ordering', () => {
  const ui = read('src/components/shared/MessagesPanel.tsx');
  const api = read('app/api/messages/threads/route.ts');
  assert.match(ui, /sortChatThreads\(all\.data\?\.threads/);
  assert.match(ui, /event\.kind === 'thread'/);
  assert.match(ui, /event\.kind === 'sync'/);
  assert.match(ui, /event\.bookingId === selected/);
  assert.match(ui, /typingByThread\[thread\.id\]/);
  assert.match(ui, /typingName} is typing/);
  assert.match(api, /createdAt: b\.createdAt/);
  assert.match(api, /latest\?\.createdAt \?\? a\.createdAt/);
  assert.match(read('supabase/enable-realtime.sql'), /'messages','message_reads','message_typing'/);
});
