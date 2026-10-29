const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const source = p => fs.readFileSync(path.join(root, p), 'utf8');

const components = [
  'src/components/ui/BookingSurface.tsx',
  'src/components/ui/BookingFeedback.tsx',
  'src/components/ui/BookingChangeDialog.tsx',
  'src/components/client/BookingList.tsx',
  'src/components/client/BookedEventExperience.tsx',
  'src/components/coordinator/RequestList.tsx',
  'src/components/coordinator/ReviewRequest.tsx',
  'src/components/coordinator/EventScheduleEditor.tsx',
  'src/components/shared/WalkInBooking.tsx',
  'app/(portal)/client/bookings/submitted/page.tsx',
  'app/(portal)/admin/bookings/page.tsx',
  'app/(portal)/coordinator/requests/page.tsx',
];

test('all booking UI source files transpile without syntax errors', () => {
  for (const filename of components) {
    const diagnostics = ts.transpileModule(source(filename), {
      fileName: filename, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    }).diagnostics || [];
    const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${filename}: ${errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('; ')}`);
  }
});

test('client and employee bookings can be searched and filtered without changing API permissions', () => {
  for (const file of ['src/components/client/BookingList.tsx', 'src/components/coordinator/RequestList.tsx']) {
    const text = source(file);
    assert.match(text, /\/api\/bookings/);
    assert.match(text, /BookingSearch/);
    assert.match(text, /BookingRecord/);
    assert.match(text, /ListSkeleton/);
    assert.match(text, /refresh/);
  }
});

test('new employee walk-in creation link respects module permissions', () => {
  assert.match(source('src/components/coordinator/RequestList.tsx'), /canCreateWalkIn \? <Link/);
  for (const route of ['app/(portal)/admin/bookings/page.tsx', 'app/(portal)/coordinator/requests/page.tsx']) {
    assert.match(source(route), /pagePermission\('bookings\.view\.all'\)/);
    assert.match(source(route), /can\(user, 'bookings\.create\.walkin'\)/);
  }
});

test('staff booking save still requires review confirmation, preserves version check and date protection', () => {
  const review = source('src/components/coordinator/ReviewRequest.tsx');
  assert.match(review, /onSubmit=\{previewSave\}/);
  assert.match(review, /BookingChangeDialog/);
  assert.match(review, /if \(busy \|\| !confirmationOpen \|\| !booking\) return/);
  assert.match(review, /expectedUpdatedAt: editingVersion \|\| booking\.updatedAt/);
  assert.match(review, /overrideConflict: false/);
  assert.match(review, /BookingSavedDialog/);
  assert.match(review, /if \(canViewList\) router\.push\(listHref\)/);
});

test('event scheduling flow and role guard remain present', () => {
  const review = source('src/components/coordinator/ReviewRequest.tsx');
  const schedule = source('src/components/coordinator/EventScheduleEditor.tsx');
  assert.match(review, /EventScheduleEditor booking=\{booking\} canEdit=\{canUpdateStatus\}/);
  assert.match(schedule, /\/api\/bookings\/\$\{booking\.id\}\/schedule/);
  assert.match(schedule, /expectedUpdatedAt: booking\.updatedAt/);
  assert.match(schedule, /!canEdit \|\| booking\.status === 'CANCELLED'/);
});

test('client booking preferences still require explicit review and cancellation remains separate', () => {
  const client = source('src/components/client/BookedEventExperience.tsx');
  const route = source('app/(portal)/client/bookings/[id]/page.tsx');
  assert.match(route, /<BookedEventExperience id=\{id\}/);
  assert.match(client, /BookingChangeDialog/);
  assert.match(client, /if \(!confirmChanges \|\| busy \|\| !editable \|\| !booking\) return/);
  assert.match(client, /json\('PATCH'/);
  assert.match(client, /\/api\/bookings\/\$\{id\}\/cancel/);
  assert.match(client, /booking\.status === 'TENTATIVE' \|\| booking\.status === 'HELD'/);
});

test('success feedback keeps booking view, messaging and walk-in follow-up destinations', () => {
  const submitted = source('app/(portal)/client/bookings/submitted/page.tsx');
  const walkin = source('src/components/shared/WalkInBooking.tsx');
  const feedback = source('src/components/ui/BookingFeedback.tsx');
  assert.match(submitted, /readBooking\(id, user\)/);
  assert.match(submitted, /BookingSuccessCard/);
  assert.match(submitted, /messageHref=\{`\/client\/messages\?booking=/);
  assert.match(walkin, /BookingSuccessCard/);
  assert.match(walkin, /viewHref=\{`\$\{base\}\/\$\{completed\.id\}`\}/);
  assert.match(feedback, /<BookingStatus value=\{status\}/);
});

test('shared booking components support keyboard accessible dialogs and mobile layouts', () => {
  const confirm = source('src/components/ui/BookingChangeDialog.tsx');
  const feedback = source('src/components/ui/BookingFeedback.tsx');
  const css = source('src/components/ui/BookingSurface.module.css');
  assert.match(confirm, /dialogRef\.current/);
  assert.match(confirm, /onCancel=/);
  assert.match(confirm, /aria-labelledby/);
  assert.match(feedback, /aria-labelledby=\"booking-saved-title\"/);
  assert.match(css, /@media\(max-width:610px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
