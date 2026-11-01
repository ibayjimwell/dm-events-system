const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const changed = [
  'src/models/messaging.ts', 'src/models/read.ts',
  'app/api/messages/threads/route.ts', 'app/api/messages/route.ts',
  'app/api/messages/typing/route.ts', 'app/api/events/route.ts',
  'src/components/shared/MessagesPanel.tsx', 'src/components/shared/SiteNav.tsx',
  'src/lib/notifications/providers.ts', 'app/(portal)/coordinator/messages/page.tsx',
];

test('all messaging implementation files parse as complete TypeScript', () => {
  for (const file of changed) {
    const result = ts.transpileModule(read(file), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    assert.deepEqual((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), [], file);
  }
});

test('inbox filters ONLY on client name, regardless of booking and event identifiers', () => {
  const panel = read('src/components/shared/MessagesPanel.tsx');
  const from = panel.indexOf('const filtered = useMemo(');
  const to = panel.indexOf('const unreadTotal', from);
  assert.ok(from >= 0 && to > from);
  const filter = panel.slice(from, to);
  assert.match(filter, /thread\.clientName\.toLocaleLowerCase\(\)\.includes\(name\)/);
  assert.doesNotMatch(filter, /eventType|reference|latest\.body/);
  assert.match(panel, /placeholder="Search client name"/);
  assert.match(panel, /Try searching by client name/);
});

test('inbox is independently scrollable and composer stays visible on mobile and desktop', () => {
  const css = read('src/components/shared/MessagesPanel.module.css');
  assert.match(css, /\.sidebar \{[^}]*min-height:0;[^}]*overflow:hidden;/);
  assert.match(css, /\.threadList \{[^}]*min-height:0;[^}]*overflow-y:auto;/);
  assert.match(css, /\.chat \{[^}]*min-height:0;[^}]*overflow:hidden;/);
  assert.match(css, /\.composer \{[^}]*flex-shrink:0;/);
  assert.match(css, /\.messageScroll \{[^}]*overflow-y:auto;/);
  const panel = read('src/components/shared/MessagesPanel.tsx');
  assert.match(panel, /ref=\{messageScrollRef\}/);
  assert.match(panel, /element\.scrollTop = element\.scrollHeight/);
  assert.doesNotMatch(panel, /scrollIntoView/);
});

test('client, coordinator and admin get a composer and all roles can send after server authorization', () => {
  const panel = read('src/components/shared/MessagesPanel.tsx');
  assert.match(panel, /<form className=\{styles\.composer\} onSubmit=\{send\}>/);
  assert.doesNotMatch(panel, /role !== 'ADMIN' \? <form|role === 'ADMIN' \? <div className=\{styles\.readOnly/);
  const messagesApi = read('app/api/messages/route.ts');
  assert.match(messagesApi, /await requireMessageBooking\(v\.bookingId, u\)/);
  assert.doesNotMatch(messagesApi, /u\.role === "ADMIN"/);
  assert.match(messagesApi, /if \(u\.role !== "CLIENT"\)/);
  assert.match(read('app/api/messages/typing/route.ts'), /requireMessageBooking/);
  assert.match(read('src/components/shared/SiteNav.tsx'), /href: '\/admin\/messages'/);
});

test('messaging access remains scoped while standalone from booking management permission', () => {
  const model = read('src/models/messaging.ts');
  assert.match(model, /booking\.clientId !== actor\.id/);
  assert.match(model, /can\(actor, 'messages\.staff'\)/);
  assert.match(model, /eq\(bookings\.clientId, actor\.id\)/);
  assert.doesNotMatch(model, /can\(actor, 'bookings\.view\.all'\)/);
  assert.match(read('src/models/read.ts'), /await requireMessageBooking\(bookingId,user\)/);
  const events = read('app/api/events/route.ts');
  assert.match(events, /allowedChatBooking/);
  assert.match(events, /if \(!allowedChatBooking\(row\?\.booking_id\)\) return/);
});
