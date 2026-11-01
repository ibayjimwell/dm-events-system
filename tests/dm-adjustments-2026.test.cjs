const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const code = p => fs.readFileSync(path.join(root,p),'utf8');

test('single Inter typography across all stylesheets and components', () => {
  const files = ['app/globals.css','app/marketing.css','app/operations.css'];
  for (const f of files) assert.doesNotMatch(code(f), /Barlow|Georgia|Cambria|Times New Roman/);
  function walk(dir){for(const x of fs.readdirSync(dir,{withFileTypes:true})){
    if(x.isDirectory()) walk(path.join(dir,x.name));
    else if(/\.(css|tsx)$/.test(x.name)) assert.doesNotMatch(fs.readFileSync(path.join(dir,x.name),'utf8'), /Barlow|Georgia|Cambria|Times New Roman/);
  }}
  walk(path.join(root,'src'));
});

test('overview KPI drilldowns, monthly snapshots, and individual ledger details', () => {
  const overview=code('src/components/admin/Overview.tsx');
  assert.match(overview,/\?status=CONFIRMED/);
  assert.match(overview,/href=\{`\/admin\/analytics\?month=/);
  assert.match(overview,/month\.count\} new confirmations/);
  const analytics=code('src/components/admin/Analytics.tsx');
  assert.match(analytics,/new URLSearchParams\(window\.location\.search\)/);
  assert.match(analytics,/item\.bookingId/);
  assert.match(code('src/components/coordinator/RequestList.tsx'), /Sort bookings/);
  assert.match(code('src/components/client/BookingList.tsx'), /Sort bookings/);
  assert.match(code('app/api/analytics/route.ts'),/bookingId: bookings\.id/);
});

test('BookingSummary metrics filter both client and staff bookings',()=>{
  const common=code('src/components/ui/BookingSurface.tsx');
  assert.match(common,/onClick=\{item\.onClick\}/);
  for(const name of ['src/components/client/BookingList.tsx','src/components/coordinator/RequestList.tsx']){
    const file=code(name);
    assert.match(file,/onClick: \(\) => selectStatus/);
    assert.match(file,/window\.history\.replaceState/);
  }
});

test('unsaved booking edits are guarded in staff status/schedule and client preferences',()=>{
  const hook=code('src/hooks/useUnsavedChangesGuard.tsx');
  assert.match(hook,/beforeunload/);
  assert.match(hook,/addEventListener\('click',onClick,true\)/);
  assert.match(hook,/addEventListener\('popstate'/);
  assert.match(hook,/Leave without saving/);
  for(const name of ['src/components/coordinator/ReviewRequest.tsx','src/components/client/BookedEventExperience.tsx','src/components/client/BookingDetail.tsx']){
    assert.match(code(name),/useUnsavedChangesGuard/);
  }
  assert.match(code('src/components/coordinator/EventScheduleEditor.tsx'),/onDirtyChange/);
});

test('shared no-billing OpenStreetMap location picker and numeric budget validation for both booking routes',()=>{
  const wizard=code('src/components/client/BookingWizard.tsx');
  assert.match(wizard,/<VenueLocationPicker/);
  assert.match(wizard,/venueLatitude: venueCoordinates\?\.lat/);
  assert.match(wizard,/inputMode="decimal"/);
  const map=code('src/components/ui/VenueLocationPicker.tsx');
  assert.match(map,/tile\.openstreetmap\.org/);
  assert.match(map,/loadLeaflet/);
  assert.match(map,/pickCoordinates/);
  assert.match(map,/\/api\/locations\?q=/);
  assert.doesNotMatch(map,/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(wizard,/coordinates=\{venueCoordinates\}/);
  const validators=code('src/lib/validators.ts');
  assert.match(validators,/estimatedBudget: z\.string\(\).*\.regex\(/);
  for(const name of ['app/api/bookings/route.ts','app/api/bookings/walk-in/route.ts']){
    assert.match(code(name),/venueLatitude:/);
    assert.match(code(name),/venueLongitude:/);
    assert.match(code(name),/Select a complete venue location/);
  }
});

test('package gallery is migrated, permission-checked and rendered as carousel',()=>{
  assert.match(code('drizzle/0009_package_image_gallery.sql'),/ADD COLUMN IF NOT EXISTS image_ids uuid\[\]/);
  assert.match(code('src/db/schema.ts'),/imageIds: uuid\("image_ids"\)\.array\(\)/);
  assert.match(code('src/lib/validators.ts'),/imageIds: z\.array\(z\.string\(\)\.uuid\(\)\)\.max\(10/);
  assert.match(code('src/lib/packageGallery.ts'),/a\.kind !== 'PACKAGE' \|\| a\.deliveryType !== 'upload'/);
  assert.match(code('app/api/assets/[id]/route.ts'),/ANY\(\$\{packages\.imageIds\}\)/);
  assert.match(code('src/components/admin/PackageEditor.tsx'),/multiple disabled/);
  for(const name of ['src/components/marketing/PackageShowcaseCard.tsx','app/(public)/packages/[id]/page.tsx','src/components/client/BookingWizard.tsx']){
    assert.match(code(name),/PackageImageCarousel/);
  }
  assert.match(code('src/components/ui/PackageImageCarousel.tsx'),/Previous photo/);
});

test('legacy package images remain cover and gallery selection rejects duplicate IDs',async()=>{
  const compiled=ts.transpileModule(code('src/lib/packageGallery.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const m={exports:{}};class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
  const assets=[{id:'id1',kind:'PACKAGE',deliveryType:'upload'},{id:'id2',kind:'PACKAGE',deliveryType:'upload'}];
  const requireMock=name=>name==='@/db'?{db:{select:()=>({from:()=>({where:()=>Promise.resolve(assets)})})}}:name==='@/db/schema'?{mediaAssets:{id:'id',kind:'kind',deliveryType:'deliveryType'}}:name==='@/lib/http'?{HttpError}:name==='drizzle-orm'?{inArray:()=>true}: (()=>{throw new Error(name)})();
  vm.runInNewContext(compiled,{exports:m.exports,module:m,require:requireMock,Set,Error});
  assert.deepEqual(Array.from(m.exports.canonicalPackageImages({imageIds:[],imageId:'id1'}).imageIds),['id1']);
  assert.deepEqual(Array.from(m.exports.canonicalPackageImages({imageIds:['id2'],imageId:'id1'}).imageIds),['id2']);
  await assert.rejects(m.exports.validatePackageGallery(['id1','id1']),/unique images/);
  await m.exports.validatePackageGallery(['id1','id2']);
});
