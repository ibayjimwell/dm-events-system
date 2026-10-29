const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(project, relative), 'utf8');
const ts = require('typescript');

test('all modified React components and role layouts parse', () => {
  for (const file of [
    'src/components/shared/MessagesPanel.tsx',
    'src/components/shared/PortalMessengerFrame.tsx',
    'app/(portal)/admin/layout.tsx',
    'app/(portal)/client/layout.tsx',
    'app/(portal)/coordinator/layout.tsx',
  ]) {
    const result = ts.transpileModule(read(file), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
  }
});

test('full-screen route switches portal chrome off for all messaging screens', () => {
  const frame = read('src/components/shared/PortalMessengerFrame.tsx');
  assert.match(frame, /\^\\\/\(client\|coordinator\|admin\)/);
  assert.match(frame, /data-messenger-fullscreen="true"/);
  assert.match(frame, /fixed inset-0/);
  assert.match(frame, /h-\[100dvh\]/);
  assert.match(frame, /if \(inMessenger\)/);
  assert.match(frame, /<SiteNav role=\{role\}/);
  assert.match(frame, /<Footer label=\{footerLabel\}/);
  for (const role of ['admin','client','coordinator']) {
    const layout = read(`app/(portal)/${role}/layout.tsx`);
    assert.match(layout, /await actor\(\)/);
    assert.match(layout, /permissionSet\(user\)/);
    assert.match(layout, /PortalMessengerFrame/);
  }
});

test('messenger container fills viewport with no page chrome or rounded outer frame', () => {
  const ui = read('src/components/shared/MessagesPanel.tsx');
  const css = read('src/components/shared/MessagesPanel.module.css');
  assert.match(ui, /data-messenger-edge-to-edge="true"/);
  assert.doesNotMatch(ui, /page-wrap page-space/);
  assert.doesNotMatch(ui, /<header className=\{styles\.heading\}/);
  assert.doesNotMatch(ui, /styles\.infoRibbon/);
  assert.match(css, /\.shell\s*\{[^}]*border-radius:0;/);
  assert.match(css, /\.shell\s*\{[^}]*height:100%;/);
  assert.match(css, /\.shell\s*\{[^}]*box-shadow:none;/);
  assert.match(css, /\.page\s*\{[^}]*margin:0;/);
  assert.match(css, /\.messageScroll\s*\{[^}]*overflow-y:auto;/);
});

test('chat still has messages, typing, Seen, attachment, mobile and navigation controls', () => {
  const ui = read('src/components/shared/MessagesPanel.tsx');
  assert.match(ui, /<header className=\{styles\.chatHeader\}>/);
  assert.match(ui, /Return to portal/);
  assert.match(ui, /Back to conversations/);
  assert.match(ui, /View booking details/);
  assert.match(ui, /subscribeToChatEvents/);
  assert.match(ui, /signalTyping/);
  assert.match(ui, /wasSeen/);
  assert.match(ui, /\/api\/uploads/);
  assert.match(ui, /role !== 'ADMIN'/);
  assert.match(ui, /styles\.mobileHiddenChat/);
});
