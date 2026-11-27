'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const id = '8e7f2db4-a276-4eaf-bfda-cd7569431f9f';

function loadPureTs(file) {
  const filename = path.join(root, file);
  const js = ts.transpileModule(read(file), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(js, filename);
  return compiled.exports;
}

test('validating package IDs prevents injection, duplicate query params and open redirects', () => {
  const { isValidBookingPackageId, bookingDestination, safeBookingDestination, loginForBooking } = loadPureTs('src/lib/bookingNavigation.ts');
  assert.equal(isValidBookingPackageId(id), true);
  assert.equal(isValidBookingPackageId('not-a-uuid'), false);
  assert.equal(isValidBookingPackageId(['x']), false);
  assert.equal(isValidBookingPackageId(null), false);
  assert.equal(safeBookingDestination(bookingDestination(id)), bookingDestination(id));
  assert.equal(safeBookingDestination(`/client/book?package=${id}&package=${id}`), null);
  assert.equal(safeBookingDestination('/client/book?package=../../../admin'), null);
  const next = new URL(loginForBooking(id), 'https://dm-events.invalid').searchParams.get('next');
  assert.equal(safeBookingDestination(next), bookingDestination(id));
});

test('legacy event type is derived from the published package name, not the browser', () => {
  const { EVENT_CONSULTATION_LABEL, bookingEventLabel } = loadPureTs('src/lib/bookingEventLabel.ts');
  assert.equal(bookingEventLabel('Wedding Planning'), 'Wedding Planning');
  assert.equal(bookingEventLabel('  Birthday Celebration  '), 'Birthday Celebration');
  assert.equal(bookingEventLabel(null), EVENT_CONSULTATION_LABEL);
  assert.equal(bookingEventLabel(''), EVENT_CONSULTATION_LABEL);
  assert.equal(bookingEventLabel('   '), EVENT_CONSULTATION_LABEL);
  assert.equal(bookingEventLabel('x'.repeat(200)).length, 120);
  assert.equal(Array.from(bookingEventLabel('🎉'.repeat(125))).length, 120);
  const validator = read('src/lib/validators.ts');
  const bookingInput = validator.slice(validator.indexOf('export const bookingInput ='), validator.indexOf('export const messageReadInput'));
  assert.doesNotMatch(bookingInput, /eventType\s*:/);
  for (const name of ['app/api/bookings/route.ts', 'app/api/bookings/walk-in/route.ts']) {
    const server = read(name);
    assert.match(server, /const eventType = bookingEventLabel\(pkg\?\.name\)/);
    assert.match(server, /eq\(packages\.published,\s*true\)/);
    assert.match(server, /eventType[,}]/);
    assert.doesNotMatch(server, /eventType\s*:\s*(values|v)\.eventType/);
  }
});

test('package selections start at the date step in client and staff flows', () => {
  const wizard = read('src/components/client/BookingWizard.tsx');
  assert.match(wizard, /useState<Step>\(initialPackageId \? 2 : 1\)/);
  assert.match(wizard, /setStep\(2\)/);
  assert.match(wizard, /function choosePackage\(id: string\)/);
  assert.match(wizard, /choosePackage\(item\.id\)/);
  assert.match(wizard, /choosePackage\(''\)/);
  assert.match(wizard, /publishedPackages = result\.packages\.filter\(pkg => pkg\.published === true\)/);
  assert.match(wizard, /Change package/);
  for (const file of [
    'app/(portal)/client/book/page.tsx',
    'app/(portal)/admin/walk-in/page.tsx',
    'app/(portal)/coordinator/walk-in/page.tsx',
  ]) {
    const page = read(file);
    assert.match(page, /publishedRequestedPackageId/);
    assert.match(page, /await pagePermission/);
    assert.match(page, /initialPackageId=\{packageId\}/);
  }
  assert.match(read('src/models/bookingPackageSelection.ts'), /eq\(packages\.published, true\)/);
});

test('landing cards and package detail offer direct package-specific booking', () => {
  const card = read('src/components/marketing/PackageShowcaseCard.tsx');
  const homepage = read('src/components/marketing/HomeShowcase.tsx');
  const detail = read('app/(public)/packages/[id]/page.tsx');
  const catalog = read('app/(public)/packages/page.tsx');
  assert.match(card, /Choose this package/);
  assert.match(card, /loginForBooking\(item\.id\)/);
  assert.match(homepage, /userIsClient \? bookingDestination\(item\.id\)/);
  assert.match(catalog, /bookingDestination\(item\.id\)/);
  assert.match(detail, /bookingDestination\(pkg\.id\)/);
  assert.match(detail, /loginForBooking\(pkg\.id\)/);
  assert.match(detail, /\/walk-in\?package=/);
});

test('event type selector is removed without affecting date, image, budget, and consent checks', () => {
  const wizard = read('src/components/client/BookingWizard.tsx');
  assert.doesNotMatch(wizard, /booking-event-type|customEventType|eventTypes|form\.eventType/);
  for (const value of ['bookingWindowRejection(form.eventDate)', 'assertAvailableDate(form.eventDate)', "uploadImage(file, 'INSPIRATION')", 'Minimum event budget is ₱5,000', 'normalizedPhone', '!consent']) {
    assert.ok(wizard.includes(value), value);
  }
  assert.match(read('app/api/bookings/route.ts'), /requireBookingDateWithinWindow\(values\.eventDate\)/);
  assert.match(read('app/api/bookings/walk-in/route.ts'), /requireBookingDateWithinWindow\(v\.eventDate\)/);
});

test('all changed TypeScript and TSX source files parse and transpile without syntax errors', () => {
  const files = [
    'src/lib/bookingEventLabel.ts', 'src/lib/bookingNavigation.ts', 'src/models/bookingPackageSelection.ts',
    'src/lib/validators.ts', 'src/components/client/BookingWizard.tsx', 'src/components/shared/WalkInBooking.tsx',
    'src/components/marketing/PackageShowcaseCard.tsx', 'src/components/marketing/HomeShowcase.tsx',
    'app/(portal)/client/book/page.tsx', 'app/(portal)/admin/walk-in/page.tsx', 'app/(portal)/coordinator/walk-in/page.tsx',
    'app/(public)/packages/page.tsx', 'app/(public)/packages/[id]/page.tsx', 'app/(public)/page.tsx',
    'app/api/bookings/route.ts', 'app/api/bookings/walk-in/route.ts',
  ];
  for (const file of files) {
    const result = ts.transpileModule(read(file), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve },
    });
    const errors = (result.diagnostics ?? []).filter(diag => diag.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(diag => ts.flattenDiagnosticMessageText(diag.messageText, '\n')), [], file);
  }
});
