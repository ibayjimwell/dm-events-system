const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const file = name => fs.readFileSync(path.join(root, name), 'utf8');
function isolatedTS(name) {
  const result = ts.transpileModule(file(name), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputText)(module, module.exports, require);
  return module.exports;
}
const value = isolatedTS('src/lib/confirmedValue.ts');

test('confirmation records a positive commitment in PHP', () => {
  assert.deepEqual(value.valueMovement('HELD', null, 'CONFIRMED', 50000), {
    eventType: 'CONFIRMATION', amountDelta: '50000.00', valueAfter: '50000.00',
  });
});
test('booking value adjustments record only the delta, not a second confirmation', () => {
  assert.deepEqual(value.valueMovement('CONFIRMED', '50000.00', 'CONFIRMED', 45000), {
    eventType: 'ADJUSTMENT', amountDelta: '-5000.00', valueAfter: '45000.00',
  });
});
test('a cancellation reverses the currently confirmed commitment', () => {
  assert.deepEqual(value.valueMovement('CONFIRMED', '45000.00', 'CANCELLED', '45000.00'), {
    eventType: 'REVERSAL', amountDelta: '-45000.00', valueAfter: '0.00',
  });
});
test('no changes create no ledger entry; cent amounts are stable', () => {
  assert.equal(value.valueMovement('HELD', null, 'HELD', null), null);
  assert.equal(value.valueMovement('CONFIRMED', '10.10', 'CONFIRMED', 10.1), null);
  assert.deepEqual(value.valueMovement('CONFIRMED', '10.10', 'CONFIRMED', 10.17), {
    eventType: 'ADJUSTMENT', amountDelta: '0.07', valueAfter: '10.17',
  });
});
test('month extraction is Philippine time, including UTC rollover', () => {
  assert.equal(value.manilaMonth(new Date('2026-10-31T16:01:00Z')), '2026-11');
  assert.equal(value.manilaMonth(new Date('2026-10-31T15:59:00Z')), '2026-10');
});
test('ledger write and outbox intent are in the same booking transaction', () => {
  const route = file('app/api/bookings/[id]/status/route.ts');
  assert.match(route, /db\.transaction/);
  assert.match(route, /tx\.insert\(bookingValueEvents\)/);
  assert.match(route, /tx\.insert\(notificationOutbox\)/);
  assert.match(route, /expectedUpdatedAt/);
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /conflicts\.length/);
});
test('scheduling accepts only authorized staff, and rejects stale editor updates', () => {
  const source = file('app/api/bookings/[id]/schedule/route.ts');
  assert.match(source, /requirePermission\('bookings\.status'\)/);
  assert.match(source, /booking\.updatedAt\.toISOString\(\) !== input\.expectedUpdatedAt/);
  assert.match(source, /eq\(users\.isActive, true\)/);
  assert.match(source, /eventStartTime >= v\.eventEndTime/);
  assert.doesNotMatch(source, /bookingHistory/); // internal notes must not reach client history
});
test('booking detail redacts internal scheduling notes from clients', () => {
  const source = file('src/models/read.ts');
  assert.match(source, /scheduleNotes:await can\(user,'bookings\.review'\)\?item\.booking\.scheduleNotes:''/);
});
test('monthly analytics and CSV read ledger movements, not mutable current status', () => {
  for (const name of ['app/api/analytics/route.ts', 'app/api/report.csv/route.ts']) {
    assert.match(file(name), /bookingValueEvents/);
    assert.doesNotMatch(file(name), /eq\(bookings\.status,\s*'CONFIRMED'\)/);
  }
});
test('new migration is registered, preserves old bookings and backfills once', () => {
  const sql = file('drizzle/0005_operational_scheduling_value_ledger.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "public"\."booking_value_events"/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM "public"\."booking_value_events"/);
  assert.match(sql, /event_start_time/);
  assert.match(file('drizzle/meta/_journal.json'), /0005_operational_scheduling_value_ledger/);
});
