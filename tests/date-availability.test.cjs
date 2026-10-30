const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const records = [
  { eventDate: '2026-10-30', status: 'HELD' },
  { eventDate: '2026-10-30', status: 'CONFIRMED' },
  { eventDate: '2026-10-31', status: 'TENTATIVE' },
  { eventDate: '2026-10-15', status: 'CANCELLED' },
  { eventDate: '2026-11-02', status: 'HELD' },
];

const filterLib = {
  eq: (column, value) => (row) => row[column] === value,
  gte: (column, value) => (row) => row[column] >= value,
  lt: (column, value) => (row) => row[column] < value,
  inArray: (column, values) => (row) => values.includes(row[column]),
  and: (...predicates) => (row) => predicates.every((predicate) => predicate(row)),
};
const database = {
  select(fields) {
    return {
      from() {
        return {
          where(predicate) {
            const rows = records.filter(predicate).map(row => Object.fromEntries(
              Object.entries(fields).map(([key, field]) => [key, row[field]])
            ));
            return {
              limit(count) { return Promise.resolve(rows.slice(0, count)); },
              then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
            };
          },
        };
      },
    };
  },
};
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function loadServerAvailability() {
  const file = path.join(root, 'src/lib/bookingAvailability.ts');
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  const requireMock = (name) => {
    if (name === 'drizzle-orm') return filterLib;
    if (name === '@/db') return { db: database };
    if (name === '@/db/schema') return { bookings: { eventDate: 'eventDate', status: 'status' } };
    if (name === '@/lib/http') return { HttpError };
    throw new Error('Unknown dependency: ' + name);
  };
  vm.runInNewContext(compiled, { exports: mod.exports, module: mod, require: requireMock, Date, Intl, Map, Error });
  return mod.exports;
}

const availability = loadServerAvailability();

test('date validation rejects impossible dates and accepts leap day', () => {
  assert.equal(availability.isISODate('2028-02-29'), true);
  assert.equal(availability.isISODate('2026-02-29'), false);
  assert.equal(availability.isISODate('2026-13-01'), false);
  assert.equal(availability.isISODate('2026-10-30'), true);
  assert.equal(availability.isISOMonth('2026-10'), true);
  assert.equal(availability.isISOMonth('2026-00'), false);
});

test('only held and confirmed dates are blocked, duplicate legacy records do not leak data', async () => {
  const dates = await availability.reservedDatesForMonth('2026-10');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].date, '2026-10-30');
  assert.equal(dates[0].status, 'CONFIRMED');
  assert.deepEqual(Object.keys(dates[0]).sort(), ['date', 'status']);
});

test('month bounds exclude next-month reservations', async () => {
  const dates = await availability.reservedDatesForMonth('2026-11');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].date, '2026-11-02');
});

test('server rejects occupied date with 409, accepts a free date', async () => {
  await assert.rejects(availability.requireAvailableBookingDate('2026-10-30'), (e) => e.status === 409);
  await availability.requireAvailableBookingDate('2026-11-03');
});

test('both booking APIs use server-side reservation validation', () => {
  for (const name of ['app/api/bookings/route.ts', 'app/api/bookings/walk-in/route.ts']) {
    assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /await requireAvailableBookingDate\(/);
  }
});

test('both forms use the shared date picker and repeat date availability check', () => {
  const wizard = fs.readFileSync(path.join(root, 'src/components/client/BookingWizard.tsx'),'utf8');
  assert.match(wizard, /<AvailableDatePicker/);
  assert.ok((wizard.match(/await assertAvailableDate\(/g) || []).length >= 2);
  const walkIn = fs.readFileSync(path.join(root, 'src/components/shared/WalkInBooking.tsx'),'utf8');
  assert.match(walkIn, /BookingWizard walkInRole=\{role\}/);
  const content = fs.readFileSync(path.join(root, 'src/components/ui/AvailableDatePicker.tsx'), 'utf8');
  assert.match(content, /disabled=\{unavailable\}/);
  assert.match(content, /\?month=/);
  assert.match(content, /status === 'HELD'/);
});
