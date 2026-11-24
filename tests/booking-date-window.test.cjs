// Regression tests for the client and walk-in three-calendar-month booking limit.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compiled = ts.transpileModule(read('src/lib/bookingDateWindow.ts'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { exports: mod.exports, module: mod, Date, Intl });
const { bookingDateWindow, isBookableDate, isValidBookingISODate, BOOKING_WINDOW_MONTHS } = mod.exports;
const at = (iso) => new Date(iso);

test('the booking limit is three calendar months, including both endpoints', () => {
  const clock = at('2026-11-24T11:17:00Z'); // Manila: November 24
  const range = bookingDateWindow(clock);
  assert.equal(BOOKING_WINDOW_MONTHS, 3);
  assert.equal(range.start, '2026-11-24');
  assert.equal(range.end, '2027-02-24');
  assert.equal(isBookableDate(range.start, clock), true);
  assert.equal(isBookableDate(range.end, clock), true);
  assert.equal(isBookableDate('2026-11-23', clock), false);
  assert.equal(isBookableDate('2027-02-25', clock), false);
  assert.equal(isBookableDate('2028-01-01', clock), false);
});

test('Philippines calendar day, not the UTC calendar day, decides booking range', () => {
  assert.equal(bookingDateWindow(at('2026-11-23T15:59:59Z')).start, '2026-11-23');
  assert.equal(bookingDateWindow(at('2026-11-23T16:00:00Z')).start, '2026-11-24');
  assert.equal(bookingDateWindow(at('2026-11-24T15:59:59Z')).start, '2026-11-24');
  assert.equal(bookingDateWindow(at('2026-11-24T16:00:00Z')).start, '2026-11-25');
});

test('month-end dates clamp correctly, including leap February', () => {
  assert.equal(bookingDateWindow(at('2026-11-30T12:00:00Z')).end, '2027-02-28');
  assert.equal(bookingDateWindow(at('2027-11-30T12:00:00Z')).end, '2028-02-29');
  assert.equal(bookingDateWindow(at('2027-12-31T12:00:00Z')).end, '2028-03-31');
  assert.equal(bookingDateWindow(at('2027-01-31T12:00:00Z')).end, '2027-04-30');
});

test('invalid or impossible ISO dates cannot be booked', () => {
  const now = at('2026-11-24T11:00:00Z');
  for (const invalid of ['', '2026-02-29', '2026-11-31', '2026-13-01', '2026-1-20', '2026-11-24T00:00:00Z', 'foo']) {
    assert.equal(isValidBookingISODate(invalid), false, invalid);
    assert.equal(isBookableDate(invalid, now), false, invalid);
  }
  assert.equal(isValidBookingISODate('2028-02-29'), true);
});

test('shared booking calendar restricts month navigation and days past the boundary', () => {
  const calendar = read('src/components/ui/AvailableDatePicker.tsx');
  assert.match(calendar, /month >= lastBookable\.slice\(0, 7\)/);
  assert.match(calendar, /month <= today\.slice\(0, 7\)/);
  assert.match(calendar, /const beyondWindow = iso > lastBookable/);
  assert.match(calendar, /disabled=\{unavailable\}/);
  assert.match(calendar, /const interval = window\.setInterval\(update, 60_000\)/);
  assert.match(calendar, /Only dates within 3 months/);
});

test('booking submissions and availability endpoint independently enforce the window', () => {
  const wizard = read('src/components/client/BookingWizard.tsx');
  assert.equal((wizard.match(/!isBookableDate\(form\.eventDate\)/g) || []).length, 2);
  assert.match(read('src/api-client/bookingAvailability.ts'), /!response\.withinBookingWindow/);
  assert.match(read('src/lib/bookingAvailability.ts'), /!isBookableDate\(date, now\)/);
  assert.match(read('app/api/bookings/availability/route.ts'), /withinBookingWindow && status === null/);
  for (const file of ['app/api/bookings/route.ts', 'app/api/bookings/walk-in/route.ts']) {
    assert.match(read(file), /await requireAvailableBookingDate\(/);
  }
});
