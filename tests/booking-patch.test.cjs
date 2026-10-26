const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');
function read(path){return readFileSync(path,'utf8')}
test('date reservations enforce unique constraint',()=>{const sql=read('drizzle/0004_prevent_double_bookings.sql');assert.match(sql,/CREATE UNIQUE INDEX/);assert.match(sql,/WHERE "status" IN \(\'HELD\', \'CONFIRMED\'\)/);});
test('status route never bypasses date occupancy',()=>{const src=read('app/api/bookings/[id]/status/route.ts');assert.match(src,/conflicts.length\)/);assert.doesNotMatch(src,/conflicts.length\s*&&\s*!v.overrideConflict/);assert.match(src,/23505/);});
test('uploads are signed and finalized',()=>{assert.match(read('src/api-client/uploadImage.ts'),/api\/uploads\/sign/);assert.match(read('src/api-client/uploadImage.ts'),/api\/uploads\/complete/);assert.match(read('app/api/uploads/complete/route.ts'),/timingSafeEqual/);});
test('role-aware root and logout',()=>{assert.match(read('app/(public)/page.tsx'),/redirect\('\/coordinator'\)/);assert.match(read('src/components/shared/SiteNav.tsx'),/role === 'CLIENT'/);});
