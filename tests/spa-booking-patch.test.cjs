// Source contract checks; run with: node --test tests/spa-booking-patch.test.cjs
// Full Next.js compilation and browser regressions still require installed dependencies.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const src = file => readFileSync(path.join(project, file), 'utf8');

test('client navigation preserves App Router layouts and server authentication boundaries', () => {
  for (const role of ['admin', 'coordinator', 'client']) {
    const layout = src(`app/(portal)/${role}/layout.tsx`);
    assert.match(layout, /force-dynamic/);
    assert.match(layout, /actor\(/);
    assert.match(layout, /SiteNav/);
  }
  assert.match(src('src/components/shared/SiteNav.tsx'), /from 'next\/link'/);
  assert.match(src('app/layout.tsx'), /GlobalNetworkSkeleton/);
  assert.match(src('app/(portal)/loading.tsx'), /RouteSkeleton/);
  assert.match(src('app/(public)/loading.tsx'), /RouteSkeleton/);
});

test('client fetches track activity without disabling no-store or error handling', () => {
  const http = src('src/api-client/http.ts');
  assert.match(http, /beginApiRequest/);
  assert.match(http, /cache: 'no-store'/);
  assert.match(http, /finally\s*\{\s*end\(\)/);
  assert.match(src('src/components/ui/LoadingSkeleton.tsx'), /animate-pulse/);
  assert.match(src('src/api-client/uploadImage.ts'), /endUpload\(\)/);
});

test('realtime subscription is shared instead of creating a connection for every query', () => {
  assert.match(src('src/hooks/useLiveQuery.ts'), /subscribeToLiveChanges/);
  assert.match(src('src/lib/live-events.ts'), /new EventSource/);
  assert.match(src('src/lib/live-events.ts'), /if \(!listeners\.size/);
});

test('employee booking updates prompt before POST and preserve successful save and access-aware navigation', () => {
  const s = src('src/components/coordinator/ReviewRequest.tsx');
  assert.match(s, /onSubmit=\{previewSave\}/);
  assert.match(s, /setConfirmationOpen\(true\)/);
  assert.match(s, /if \(busy \|\| !confirmationOpen \|\| !booking\) return/);
  assert.match(s, /BookingChangeDialog/);
  assert.match(s, /setSavedOpen\(true\)/);
  assert.match(s, /if \(canViewList\)/);
  assert.match(s, /overrideConflict: false/);
});

test('client preference changes are previewed before mutation', () => {
  const s = src('src/components/client/BookingDetail.tsx');
  assert.match(s, /preferenceChanges/);
  assert.match(s, /onSubmit=\{previewSave\}/);
  assert.match(s, /BookingChangeDialog/);
  assert.match(s, /if \(busy \|\| !confirmationOpen \|\| !booking\) return/);
  assert.match(s, /\/api\/bookings\/\$\{id\}/);
});

test('walk-in and booking security/API modules are not replaced', () => {
  assert.match(src('src/components/shared/WalkInBooking.tsx'), /\/api\/bookings\/walk-in/);
  assert.match(src('src/components/ui/AvailableDatePicker.tsx'), /\/api\/bookings\/availability/);
  assert.match(src('src/components/ui/BookingChangeDialog.tsx'), /aria-labelledby/);
});
