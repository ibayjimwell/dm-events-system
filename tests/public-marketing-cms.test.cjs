const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadSitePresentation() {
  const source = read('src/lib/sitePresentation.ts');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const sandbox = { exports: {} };
  vm.runInNewContext(js, sandbox, { filename: 'sitePresentation.cjs' });
  return sandbox.exports;
}

test('homepage content default preserves all required marketing sections for legacy database rows', () => {
  const { normalizeHomepage } = loadSitePresentation();
  const defaultPage = normalizeHomepage(null);
  assert.ok(defaultPage.heroEyebrow.length > 2);
  assert.ok(defaultPage.aboutTitle.length > 2);
  assert.ok(defaultPage.featuresTitle.length > 2);
  assert.ok(defaultPage.packagesTitle.length > 2);
  assert.ok(defaultPage.stepsTitle.length > 2);
  assert.ok(defaultPage.ctaTitle.length > 2);
  assert.equal(defaultPage.features.length, 3);
  assert.equal(defaultPage.steps.length, 3);
});

test('homepage normalizer preserves editor input but fills missing legacy block properties', () => {
  const { normalizeHomepage } = loadSitePresentation();
  const value = normalizeHomepage({ aboutTitle: 'A new introduction', features: [{ title: 'Our first service' }] });
  assert.equal(value.aboutTitle, 'A new introduction');
  assert.equal(value.features[0].title, 'Our first service');
  assert.ok(value.features[0].description);
  assert.ok(value.features[2].title);
});

test('homepage sections are persisted in an additive SQL migration', () => {
  assert.match(read('drizzle/0006_public_homepage_content.sql'), /ADD COLUMN IF NOT EXISTS "homepage" jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(read('src/db/schema.ts'), /homepage:\s*jsonb\("homepage"\)/);
  const journal = JSON.parse(read('drizzle/meta/_journal.json'));
  assert.ok(journal.entries.some(entry => entry.tag === '0006_public_homepage_content')); // New migrations can follow the CMS migration.
  assert.ok(journal.entries.some(entry => entry.tag === '0007_realtime_chat_presence'));
  assert.equal(journal.entries.at(-1).tag, '0008_client_dual_otp');
});

test('website content remains draft/publish gated and never exposes drafts to public users', () => {
  const route = read('app/api/content/route.ts');
  assert.match(route, /requirePermission\('content\.manage'\)/);
  assert.match(route, /draft:\s*permitted \? content\.draft : undefined/);
  assert.match(route, /action === 'draft'/);
  assert.match(route, /draft: null/);
  assert.match(route, /homepage:\s*homepageSchema\.parse/);
});

test('public lists contain published packages and keep package intent through login', () => {
  const page = read('app/(public)/page.tsx');
  const listing = read('app/(public)/packages/page.tsx');
  const details = read('app/(public)/packages/[id]/page.tsx');
  const card = read('src/components/marketing/PackageShowcaseCard.tsx');
  assert.match(page, /eq\(packages\.published, true\)/);
  assert.match(listing, /eq\(packages\.published, true\)/);
  assert.match(details, /eq\(packages\.published, true\)/);
  assert.match(details, /bookingDestination\(pkg\.id\)/);
  assert.match(details, /loginForBooking\(pkg\.id\)/);
  assert.match(card, /\/packages\/\$\{item\.id\}/);
  assert.match(page, /if \(user\?\.role === 'ADMIN'\) redirect\('\/admin'\)/);
  assert.match(page, /if \(user\?\.role === 'COORDINATOR'\) redirect\('\/coordinator'\)/);
});

test('signed HERO upload follows existing strict authorization and S3-independent receipt validation', () => {
  const policy = read('src/lib/uploadPolicy.ts');
  const sign = read('app/api/uploads/sign/route.ts');
  const complete = read('app/api/uploads/complete/route.ts');
  const client = read('src/api-client/uploadImage.ts');
  assert.match(policy, /'HERO' \? 'content\.manage'/);
  assert.match(policy, /'INSPIRATION', 'PACKAGE', 'HERO'/);
  assert.match(sign, /v\.kind==='PACKAGE' \|\| v\.kind==='HERO'/);
  assert.match(complete, /\(inspiration\|package\|hero\)/);
  assert.match(complete, /timingSafeEqual/);
  assert.match(client, /'INSPIRATION'\|'PACKAGE'\|'HERO'/);
});

test('CMS and package management preserve permissions and signed image uploads', () => {
  const content = read('src/components/admin/ContentEditor.tsx');
  const packageEditor = read('src/components/admin/PackageEditor.tsx');
  assert.match(content, /uploadImage\(file, 'HERO'\)/);
  assert.match(content, /editedSinceLoad/);
  assert.match(content, /save\('draft'\)/);
  assert.match(content, /save\('publish'\)/);
  assert.match(packageEditor, /uploadImage\(file, 'PACKAGE'\)/);
  assert.match(packageEditor, /delete|remove\(p/);
  assert.match(packageEditor, /published:/);
  assert.match(read('app/(portal)/admin/maintenance/content/page.tsx'), /pagePermission\('content\.manage'\)/);
  assert.match(read('app/(portal)/admin/maintenance/packages/page.tsx'), /pagePermission\('packages\.manage'\)/);
});
