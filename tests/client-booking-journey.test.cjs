'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const wizard = read('src/components/client/BookingWizard.tsx');
const calendar = read('src/components/ui/AvailableDatePicker.tsx');
const auth = read('src/components/client/AuthForms.tsx');
const detail = read('app/(public)/packages/[id]/page.tsx');

function loadNavigation() {
  const filename = path.join(root, 'src/lib/bookingNavigation.ts');
  const js = ts.transpileModule(read('src/lib/bookingNavigation.ts'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(js, filename);
  return compiled.exports;
}
const { bookingDestination, safeBookingDestination, loginForBooking } = loadNavigation();
const id = 'b1bff300-f9f1-4ca1-a82b-0250a1ac36ab';

test('package CTA preserves an exact package UUID through login', () => {
  const destination = bookingDestination(id);
  const redirect = new URL(loginForBooking(id), 'https://dm-events.invalid');
  assert.equal(destination, `/client/book?package=${id}`);
  assert.equal(redirect.pathname, '/login');
  assert.equal(safeBookingDestination(redirect.searchParams.get('next')), destination);
  assert.match(detail, /loginForBooking\(pkg\.id\)/);
});

test('post-login redirect accepts only the client booking destination', () => {
  assert.equal(safeBookingDestination('/client/book'), '/client/book');
  assert.equal(safeBookingDestination(`/client/book?package=${id}`), `/client/book?package=${id}`);
  for (const attack of [
    'https://evil.invalid/', '//evil.invalid', '/admin', '/client/bookings',
    '/client/book?next=https://evil.invalid', '/client/book?package=not-a-uuid',
    `/client/book?package=${id}&package=${id}`, '/client/book#fragment',
  ]) assert.equal(safeBookingDestination(attack), null, attack);
  assert.match(auth, /result\.user\.role === 'ADMIN'/);
  assert.match(auth, /next \?\? pendingBooking \?\? '\/client'/);
  assert.match(auth, /BOOKING_INTENT_KEY/);
  assert.match(read('app/(public)/login/page.tsx'), /requested \?\? '\/client'/);
});

test('other public booking CTAs preserve the booking destination through login', () => {
  for (const file of ['src/components/marketing/HomeShowcase.tsx', 'app/(public)/packages/page.tsx', 'src/components/shared/Footer.tsx']) {
    assert.match(read(file), /loginForBooking\(\)/, file);
  }
});

test('five-step form contains package, inline date, event details, account contact and review', () => {
  for (const key of ['Package', 'Event date', 'Event details', 'Your contact', 'Review']) {
    assert.ok(wizard.includes(`title: '${key}'`));
  }
  assert.match(wizard, /display="inline"/);
  assert.match(wizard, /step === 5/);
  assert.match(wizard, /!consent/);
  assert.match(wizard, /role="radiogroup"/);
  assert.match(wizard, /aria-checked=\{selected\}/);
});

test('the selected package must still be published, including just before submit', () => {
  assert.match(wizard, /requestedPackageId = search\.get\('package'\)/);
  assert.match(wizard, /result\.packages\.some\(pkg => pkg\.id === requestedPackageId\)/);
  assert.match(wizard, /packages\.some\(pkg => pkg\.id === form\.packageId\)/);
  assert.match(read('app/api/bookings/route.ts'), /eq\(packages\.published,true\)/);
});

test('calendar blocks Held/Confirmed dates and rechecks the selected date on the server', () => {
  assert.match(calendar, /status === 'CONFIRMED'/);
  assert.match(calendar, /status === 'HELD'/);
  assert.match(calendar, /disabled=\{unavailable\}/);
  assert.match(wizard, /await assertAvailableDate\(form\.eventDate\)/);
  assert.match(read('app/api/bookings/route.ts'), /await requireAvailableBookingDate\(values\.eventDate\)/);
});

test('contact details load from authenticated client, while venue is optional', () => {
  assert.match(wizard, /\/api\/auth\/me/);
  assert.match(wizard, /user\.role !== 'CLIENT'/);
  assert.match(wizard, /contactName: previous\.contactName \|\| user\.fullName/);
  assert.match(wizard, /contactEmail: previous\.contactEmail \|\| user\.email/);
  assert.match(wizard, /contactPhone: previous\.contactPhone \|\| user\.phone \|\| ''/);
  assert.match(read('src/lib/validators.ts'), /venue: z\.string\(\)\.trim\(\)\.max\(2000\)\.default\(''\)/);
});

test('Other event type and inspiration photo persist in submitted payload', () => {
  assert.match(wizard, /form\.eventType === 'Other' \? customEventType\.trim\(\)/);
  assert.match(wizard, /uploadImage\(file, 'INSPIRATION'\)/);
  assert.match(wizard, /set\('inspirationAssetId', asset\.id\)/);
  assert.match(wizard, /MAX_PHOTO_BYTES = 10 \* 1024 \* 1024/);
  assert.match(wizard, /inspirationAssetId: form\.inspirationAssetId \|\| null/);
  assert.match(wizard, /router\.replace\(`\/client\/bookings\/submitted\?id=/);
});

test('updated source files transpile without syntax errors', () => {
  for (const file of [
    'src/lib/bookingNavigation.ts', 'src/components/client/BookingWizard.tsx',
    'src/components/ui/AvailableDatePicker.tsx', 'src/components/client/AuthForms.tsx',
    'app/(public)/login/page.tsx', 'app/(public)/packages/[id]/page.tsx',
    'src/lib/validators.ts', 'src/components/marketing/HomeShowcase.tsx',
    'app/(public)/packages/page.tsx', 'src/components/shared/Footer.tsx',
  ]) {
    const result = ts.transpileModule(read(file), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    });
    assert.deepEqual((result.diagnostics ?? []).map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), [], file);
  }
});
