const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, dependencies = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(source(file), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date, Intl, Math, Error, Number, Map,
    require: key => {
      if (!(key in dependencies)) throw Error('Missing mocked dependency ' + key);
      return dependencies[key];
    },
  }, { filename: file });
  return module.exports;
}

const window = load('src/lib/bookingWindow.ts');
const instant = value => new Date(value);

test('rolling window is inclusive, Philippine-time based and updates at midnight', () => {
  const before = instant('2026-11-23T15:59:59Z');
  const after = instant('2026-11-23T16:00:00Z');
  assert.equal(window.manilaToday(before), '2026-11-23');
  assert.equal(window.manilaToday(after), '2026-11-24');
  assert.equal(window.bookingWindow(after).minDate, '2026-11-24');
  assert.equal(window.bookingWindow(after).maxDate, '2027-02-24');
  assert.equal(window.bookingWindowRejection('2026-11-24', after), null);
  assert.equal(window.bookingWindowRejection('2027-02-24', after), null);
  assert.equal(window.bookingWindowRejection('2027-02-25', after), 'too_far');
  assert.equal(window.bookingWindowRejection('2026-11-23', after), 'past');
  assert.equal(window.bookingWindowRejection('2027-02-30', after), 'invalid');
});

test('three calendar months clamp short months and handle leap years', () => {
  assert.equal(window.addCalendarMonths('2027-01-31', 3), '2027-04-30');
  assert.equal(window.addCalendarMonths('2027-11-30', 3), '2028-02-29');
  assert.equal(window.addCalendarMonths('2028-11-30', 3), '2029-02-28');
  assert.equal(window.addCalendarMonths('2027-12-31', 3), '2028-03-31');
  assert.equal(window.isISODate('2028-02-29'), true);
  assert.equal(window.isISODate('2027-02-29'), false);
});

test('calendar and API reject future overflow, past dates and occupied dates', () => {
  const picker = source('src/components/ui/AvailableDatePicker.tsx');
  const wizard = source('src/components/client/BookingWizard.tsx');
  const availability = source('app/api/bookings/availability/route.ts');
  const status = source('app/api/bookings/[id]/status/route.ts');
  assert.match(picker, /month >= lastMonth/);
  assert.match(picker, /iso > maxDate/);
  assert.match(picker, /disabled=\{unavailable\}/);
  assert.match(picker, /setRange\(\{ minDate: result.minDate, maxDate: result.maxDate \}\)/);
  assert.match(wizard, /bookingWindowRejection\(form.eventDate\)/);
  assert.match(availability, /status === null && reason === null/);
  assert.match(status, /requireBookingDateWithinWindow\(before.eventDate\)/);
  for (const route of ['app/api/bookings/route.ts', 'app/api/bookings/walk-in/route.ts']) {
    assert.match(source(route), /requireAvailableBookingDate/);
  }
});

test('expired bookings cancel atomically, reverse financial commitments, retain history, and cannot cancel twice', async () => {
  const records = [
    { id: 'past-tentative', eventDate: '2026-11-23', status: 'TENTATIVE', bookedValue: null, cancellationReason: null },
    { id: 'past-held', eventDate: '2026-11-23', status: 'HELD', bookedValue: null, cancellationReason: null },
    { id: 'past-confirmed', eventDate: '2026-10-01', status: 'CONFIRMED', bookedValue: '13500.00', cancellationReason: null },
    { id: 'past-completed', eventDate: '2026-11-01', status: 'COMPLETED', bookedValue: '12000.00' },
    { id: 'past-cancelled', eventDate: '2026-11-01', status: 'CANCELLED', bookedValue: '5000.00' },
    { id: 'today', eventDate: '2026-11-24', status: 'TENTATIVE', bookedValue: null },
    { id: 'future', eventDate: '2027-11-24', status: 'CONFIRMED', bookedValue: '5000.00' },
  ];
  const names = ['bookings', 'bookingHistory', 'bookingValueEvents', 'auditLogs', 'notificationOutbox'];
  const tables = Object.fromEntries(names.map(name => [name, Object.fromEntries(['id', 'eventDate', 'status', 'cancellationReason'].map(key => [key, key]))]));
  const written = Object.fromEntries(names.map(name => [name, []]));
  const condition = {
    and: (...fns) => row => fns.every(fn => fn(row)),
    lt: (column, value) => row => row[column] < value,
    inArray: (column, values) => row => values.includes(row[column]),
    asc: column => column,
    sql: (strings, ...args) => ({ sqlStrings: strings, args }),
  };
  const tx = {
    select() { return { from() { return { where(predicate) { return {
      orderBy() { return { limit(limit) { return {
        for: async () => records.filter(predicate).slice(0, limit).map(item => ({ ...item, reference: item.id, source: 'ONLINE', contactName: 'Test User', contactEmail: 'test@example.com', contactPhone: '+639123456789', eventType: 'Test' })),
      }; } }; },
    }; } }; } }; },
    update(table) { return { set(changes) { return { where(predicate) {
      const updated = records.filter(predicate);
      for (const record of updated) Object.assign(record, {
        ...changes, cancellationReason: record.cancellationReason || 'Automatically cancelled',
      });
      return Promise.resolve();
    } }; } }; },
    insert(table) { return { values(input) {
      const rows = (Array.isArray(input) ? input : [input]).map(item => ({ ...item }));
      written[names.find(name => tables[name] === table)].push(...rows);
      const promise = Promise.resolve();
      promise.returning = async () => rows.map((item, i) => ({ id: 'history-' + i + '-' + item.bookingId, bookingId: item.bookingId }));
      promise.onConflictDoNothing = () => Promise.resolve();
      return promise;
    } }; },
  };
  const database = { transaction: async fn => fn(tx) };
  const movement = load('src/lib/confirmedValue.ts');
  const expiry = load('src/lib/overdueBookings.ts', {
    'drizzle-orm': condition,
    '@/db': { db: database },
    '@/db/schema': tables,
    '@/lib/bookingWindow': window,
    '@/lib/confirmedValue': movement,
    '@/lib/notifications/enqueue': {
      notificationRows: (booking, kind, eventId, overrides) => [{
        bookingId: booking.id, eventKey: `${kind}:${eventId}:EMAIL`, eventType: kind,
        channel: 'EMAIL', payload: { status: overrides.status },
      }],
    },
  });

  const result = await expiry.cancelOverdueBookings(instant('2026-11-23T16:00:00Z'));
  assert.equal(result.cancelled, 3);
  assert.equal(result.confirmedReversed, 1);
  assert.equal(result.complete, true);
  for (const id of ['past-tentative', 'past-held', 'past-confirmed']) {
    assert.equal(records.find(b => b.id === id).status, 'CANCELLED');
  }
  assert.equal(records.find(b => b.id === 'past-completed').status, 'COMPLETED');
  assert.equal(records.find(b => b.id === 'past-cancelled').status, 'CANCELLED');
  assert.equal(records.find(b => b.id === 'today').status, 'TENTATIVE');
  assert.equal(records.find(b => b.id === 'future').status, 'CONFIRMED');
  assert.equal(written.bookingHistory.length, 3);
  assert.ok(written.bookingHistory.every(h => h.actorId === null && h.toStatus === 'CANCELLED'));
  assert.equal(written.bookingValueEvents.length, 1);
  assert.equal(written.bookingValueEvents[0].amountDelta, '-13500.00');
  assert.equal(written.bookingValueEvents[0].valueAfter, '0.00');
  assert.equal(written.auditLogs.length, 3);
  assert.equal(written.notificationOutbox.length, 3);

  const again = await expiry.cancelOverdueBookings(instant('2026-11-23T16:00:00Z'));
  assert.equal(again.cancelled, 0);
  assert.equal(written.bookingHistory.length, 3);
  assert.equal(written.bookingValueEvents.length, 1);
});

test('daily cron and migration preserve automated status provenance', () => {
  const cron = source('app/api/cron/daily-backup/route.ts');
  const sql = source('drizzle/0014_booking_window_auto_expiry.sql');
  const schema = source('src/db/schema.ts');
  const reader = source('src/models/read.ts');
  assert.match(cron, /expired = await cancelOverdueBookings\(\)/);
  assert.ok(cron.indexOf('expired = await cancelOverdueBookings()') < cron.indexOf('managedBackupConfig().ready'));
  assert.match(sql, /ALTER COLUMN actor_id DROP NOT NULL/);
  assert.match(schema, /NULL means an automated system transition/);
  assert.match(reader, /from\(bookingHistory\)\.leftJoin\(users/);
});
