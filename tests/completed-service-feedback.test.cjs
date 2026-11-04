const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const base = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(base,name),'utf8');
function isolate(file) {
  const output = ts.transpileModule(read(file), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  new Function('module','exports',output)(mod,mod.exports);
  return mod.exports;
}

test('completion is deliberate and respects date rollover in Asia/Manila', () => {
  const {manilaDate,canMarkCompleted} = isolate('src/lib/bookingCompletion.ts');
  const before = new Date('2026-11-02T15:59:00Z'); // 23:59 Nov 2 PH
  const after = new Date('2026-11-02T16:00:00Z'); // 00:00 Nov 3 PH
  assert.equal(manilaDate(before),'2026-11-02');
  assert.equal(manilaDate(after),'2026-11-03');
  assert.equal(canMarkCompleted('CONFIRMED','2026-11-03',before),false);
  assert.equal(canMarkCompleted('CONFIRMED','2026-11-03',after),true);
  assert.equal(canMarkCompleted('HELD','2026-11-03',after),false);
  assert.equal(canMarkCompleted('CANCELLED','2026-11-03',after),false);
});

test('completed booking preserves ledger commitment rather than reversing it',()=>{
  const {valueMovement} = isolate('src/lib/confirmedValue.ts');
  assert.equal(valueMovement('CONFIRMED','15000.00','COMPLETED','15000.00'),null);
  assert.deepEqual(valueMovement('CONFIRMED','15000.00','COMPLETED','16000.00'),{
    eventType:'ADJUSTMENT',amountDelta:'1000.00',valueAfter:'16000.00',
  });
});

test('migration registers a one-review-per-booking table and guards public consent',()=>{
  const sql=read('drizzle/0012_completed_booking_feedback.sql');
  assert.match(sql,/ALTER TYPE public\.booking_status ADD VALUE IF NOT EXISTS 'COMPLETED'/);
  assert.match(sql,/booking_id uuid PRIMARY KEY REFERENCES public\.bookings/);
  assert.match(sql,/public_consent_at timestamptz/);
  assert.match(sql,/CHECK \(rating BETWEEN 1 AND 5\)/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE/i);
  const journal=JSON.parse(read('drizzle/meta/_journal.json'));
  assert.ok(journal.entries.some(entry => entry.tag === '0012_completed_booking_feedback')); 
});

test('staff completion requires permission, lock, past date and valid agreed amount',()=>{
  const route=read('app/api/bookings/[id]/status/route.ts');
  assert.match(route,/requirePermission\('bookings\.status'\)/);
  assert.match(route,/canMarkCompleted\(before\.status, before\.eventDate\)/);
  assert.match(route,/before\.status === 'COMPLETED'/);
  assert.match(route,/Number\(newValue\) < 5000/);
  assert.match(route,/\.for\('update'\)/);
  assert.match(read('src/components/coordinator/ReviewRequest.tsx'),/Completed · Event delivered/);
});

test('review API validates ownership and completion before saving, in locked transaction',()=>{
  const route=read('app/api/bookings/[id]/feedback/route.ts');
  assert.match(route,/requirePermission\('bookings\.view\.own'\)/);
  assert.match(route,/user\.role !== 'CLIENT'/);
  assert.match(route,/booking\.clientId !== user\.id/);
  assert.match(route,/booking\.source !== 'ONLINE'/);
  assert.match(route,/booking\.status !== 'COMPLETED'/);
  assert.match(route,/\.for\('update'\)/);
  assert.match(route,/onConflictDoUpdate/);
  assert.match(route,/revalidatePath\('\/'\)/);
  assert.match(read('src/lib/serviceFeedback.ts'),/\.min\(20/);
  assert.match(read('src/lib/serviceFeedback.ts'),/\.max\(1500/);
});

test('homepage reads only opted-in completed reviews with no client data',()=>{
  const source=read('src/models/serviceFeedback.ts');
  assert.match(source,/isNotNull\(bookingServiceFeedback\.publicConsentAt\)/);
  assert.match(source,/eq\(bookings\.status,'COMPLETED'\)/);
  assert.match(source,/eq\(bookings\.clientId,bookingServiceFeedback\.clientId\)/);
  assert.doesNotMatch(source,/fullName|email|contactPhone|contactEmail/);
  const page=read('app/(public)/page.tsx');
  assert.match(page,/publishedServiceFeedback\(\)/);
  assert.match(page,/feedback=\{feedback\}/);
  const home=read('src/components/marketing/HomeShowcase.tsx');
  assert.match(home,/feedback\.reviews\.length > 0/);
  assert.match(home,/Verified DM Events client/);
});

test('completed client booking has review form with stars, text and publication consent',()=>{
  const detail=read('src/components/client/BookedEventExperience.tsx');
  assert.match(detail,/booking\.status === 'COMPLETED' && <ClientServiceFeedback/);
  const form=read('src/components/client/ClientServiceFeedback.tsx');
  assert.match(form,/\[1,2,3,4,5\]/);
  assert.match(form,/minLength=\{20\}/);
  assert.match(form,/maxLength=\{1500\}/);
  assert.match(form,/type="checkbox" checked=\{publish\}/);
  assert.match(form,/json\('PUT'/);
  assert.match(read('src/components/client/BookingList.tsx'),/'COMPLETED'/);
});

test('all changed TS/TSX compile to syntax trees without parse errors',()=>{
  // Patch ZIPs intentionally omit transient build manifests. Check source files directly.
  const files=[
    'app/api/bookings/[id]/feedback/route.ts',
    'src/components/client/ClientServiceFeedback.tsx',
    'src/lib/serviceFeedback.ts',
    'src/lib/manualBackup.ts',
    'src/lib/manualBackupFormat.ts',
    'app/api/backups/route.ts',
  ];
  for(const file of files) {
    const source=read(file);
    const kind=file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS;
    const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,kind);
    assert.equal(parsed.parseDiagnostics.length,0,`${file}: ${parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')}`);
  }
});
