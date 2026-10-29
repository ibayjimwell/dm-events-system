const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

const changedTypeScript = [
  'src/db/schema.ts', 'app/api/events/route.ts', 'app/api/messages/route.ts',
  'app/api/messages/threads/route.ts', 'app/api/messages/typing/route.ts',
  'src/lib/live-events.ts', 'src/components/shared/MessagesPanel.tsx',
];

test('all complete messaging sources parse successfully', () => {
  for (const file of changedTypeScript) {
    const result = ts.transpileModule(source(file), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${file} contains a syntax error`);
  }
});

test('session-authenticated Supabase Realtime bridge never exposes service key or message bodies', () => {
  const bridge = source('app/api/events/route.ts');
  assert.match(bridge, /await actor\(\)/);
  assert.match(bridge, /realtimeServer\(\)/);
  assert.match(bridge, /allowedBooking/);
  assert.match(bridge, /canChat/);
  assert.match(bridge, /kind: 'message'/);
  assert.match(bridge, /kind: 'typing'/);
  assert.match(bridge, /kind: 'read'/);
  assert.doesNotMatch(bridge, /controller\.enqueue\([^\n]*message\.body/);
  assert.doesNotMatch(source('src/components/shared/MessagesPanel.tsx'), /SERVICE_ROLE|createClient\(/);
});

test('API validates conversation access for messaging, read, and typing changes', () => {
  const api = source('app/api/messages/route.ts');
  const typing = source('app/api/messages/typing/route.ts');
  const list = source('app/api/messages/threads/route.ts');
  for (const text of [api, typing]) assert.match(text, /await readBooking\(/);
  assert.match(typing, /user\.role === 'ADMIN'/);
  assert.match(typing, /bookingId: z\.string\(\)\.uuid\(\)/);
  assert.match(typing, /userId: user\.id/);
  assert.match(list, /await readBookings\(user\)/);
  assert.match(list, /messages\.senderId, user\.id/);
});

test('read receipts use actual sender ID and role-specific recipient, not sender role for bubble placement', () => {
  const ui = source('src/components/shared/MessagesPanel.tsx');
  assert.match(ui, /message\.senderId === viewerId/);
  assert.match(ui, /role === 'CLIENT' \? 'COORDINATOR' : 'CLIENT'/);
  assert.match(ui, /read\.lastReadAt/);
  assert.match(ui, /markRead/);
  assert.match(ui, /<CheckCheck/);
});

test('typing signals expire, debounce and use PostgreSQL/Supabase Realtime instead of exposing an anon chat table', () => {
  const typing = source('app/api/messages/typing/route.ts');
  const ui = source('src/components/shared/MessagesPanel.tsx');
  const sql = source('drizzle/0007_realtime_chat_presence.sql');
  assert.match(typing, /TTL_MS = 5500/);
  assert.match(ui, /2300/);
  assert.match(ui, /2900/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.message_typing FROM anon, authenticated/);
  assert.match(source('supabase/enable-realtime.sql'), /'message_reads','message_typing'/);
});

test('inbox, mobile chat, attachments, realtime refresh and original read-only oversight remain', () => {
  const ui = source('src/components/shared/MessagesPanel.tsx');
  assert.match(ui, /\/api\/messages\/threads/);
  assert.match(ui, /subscribeToChatEvents/);
  assert.match(ui, /\/api\/uploads/);
  assert.match(ui, /role !== 'ADMIN'/);
  assert.match(ui, /styles\.mobileHidden/);
  assert.match(ui, /KeyboardEvent/);
  assert.match(ui, /<Link href=/);
});

test('migration journal includes new migration in sequence and no existing event data is dropped', () => {
  const journal = JSON.parse(source('drizzle/meta/_journal.json'));
  assert.equal(journal.entries.at(-1).tag, '0007_realtime_chat_presence');
  const sql = source('drizzle/0007_realtime_chat_presence.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.message_typing/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});
