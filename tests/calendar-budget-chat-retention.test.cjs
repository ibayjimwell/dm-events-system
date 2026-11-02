const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('filled calendar dates prioritize confirmed over held and tentative; legend is filled', () => {
  const calendar = read('src/components/coordinator/Calendar.tsx');
  const styles = read('app/operations.css');
  assert.match(calendar, /\['CONFIRMED','HELD','TENTATIVE','CANCELLED'\]/);
  assert.match(calendar, /workspace-calendar__day--\$\{fillStatus\}/);
  assert.doesNotMatch(calendar, /items\.slice\(0,4\)\.map\(event/);
  assert.match(styles, /workspace-calendar__day--CONFIRMED\s*\{background:#167449;color:#fff/);
  assert.match(styles, /workspace-calendar__legend/);
});

test('minimum PHP 5k is checked both by forms and server validators', () => {
  const validator = read('src/lib/validators.ts');
  const form = read('src/components/client/BookingWizard.tsx');
  const review = read('src/components/coordinator/ReviewRequest.tsx');
  const route = read('app/api/bookings/[id]/status/route.ts');
  assert.match(validator, /Number\(value\) >= 5000/);
  assert.match(validator, /min\(5000, 'Agreed booking value/);
  assert.match(form, /Number\(form\.estimatedBudget\) < 5000/);
  assert.match(review, /normalizedAmount < 5000/);
  assert.match(route, /Number\(newValue\) < 5000/);
});

test('migration corrects legacy values and records explicit financial adjustments', () => {
  const sql = read('drizzle/0011_budget_calendar_chat_retention.sql');
  assert.match(sql, /SET estimated_budget = '5000\.00'/);
  assert.match(sql, /SET booked_value = 5000\.00/);
  assert.match(sql, /'ADJUSTMENT', 5000\.00 - booked_value/);
  assert.match(sql, /bookings_budget_minimum_check/);
  assert.match(sql, /bookings_booked_value_minimum_check/);
  assert.doesNotMatch(sql, /UPDATE public\.booking_value_events/);
});

test('archive is per user; deletion is staff-only and hides the thread for everyone', () => {
  const endpoint = read('app/api/messages/threads/[id]/route.ts');
  const access = read('src/models/messaging.ts');
  const api = read('app/api/messages/threads/route.ts');
  assert.match(endpoint, /actor\.role !== 'CLIENT' && await can\(actor, 'messages\.staff'\)/);
  assert.match(endpoint, /Only administrators and coordinators can delete or restore/);
  assert.match(endpoint, /messageThreadPreferences\.userId/);
  assert.match(access, /if \(deleted\) throw new HttpError\(410/);
  assert.match(api, /if \(deletion\) return false/);
  assert.match(api, /view === 'trash' && user\.role === 'CLIENT'/);
});

test('30-day retention uses secure cron, Cloudinary deletes and content tombstones', () => {
  const purge = read('src/lib/messages/purge.ts');
  const cron = read('app/api/cron/message-retention/route.ts');
  const workflow = read('.github/workflows/dm-events-chat-retention.yml');
  const upload = read('app/api/assets/[id]/route.ts');
  assert.match(purge, /uploader\.destroy/);
  assert.match(purge, /tx\.delete\(messages\)/);
  assert.match(purge, /purgedAt: new Date\(\)/);
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /MESSAGE_RETENTION_SECRET/);
  assert.match(workflow, /schedule:/);
  assert.match(upload, /asset\.kind === 'MESSAGE' && asset\.bookingId/);
});

test('UI displays chat folders, restricts deletion to staff, and provides restore confirmation', () => {
  const ui = read('src/components/shared/MessagesPanel.tsx');
  assert.match(ui, /Recently deleted/);
  assert.match(ui, /role !== 'CLIENT' && <button/);
  assert.match(ui, /setDeleteConfirm\(true\)/);
  assert.match(ui, /changeThreadState\('RESTORE'\)/);
  assert.match(ui, /view === 'archived' \? 'UNARCHIVE' : 'ARCHIVE'/);
  assert.match(ui, /30 days/);
});

test('all new TS/TSX routes and components have valid syntax', () => {
  for (const file of [
    'src/db/schema.ts', 'src/components/coordinator/Calendar.tsx', 'src/components/client/BookingWizard.tsx',
    'src/components/shared/MessagesPanel.tsx', 'app/api/messages/threads/[id]/route.ts',
    'app/api/messages/threads/route.ts', 'src/lib/messages/purge.ts', 'app/api/cron/message-retention/route.ts',
  ]) {
    const r = ts.transpileModule(read(file), { fileName: file, reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    assert.equal((r.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
  }
});
