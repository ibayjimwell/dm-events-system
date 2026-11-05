#!/usr/bin/env node
/**
 * Diagnose whether a live DM Events deployment serves the manual backup API.
 * Does not authenticate, request an export, print cookies, or download private data.
 * Usage: node scripts/check-vercel-backup.mjs https://your-site.vercel.app
 * The expected anonymous response is 401/403 JSON (permission denied) or 200 JSON.
 */
const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/check-vercel-backup.mjs https://YOUR_SITE.vercel.app');
  process.exit(2);
}
let url;
try {
  const base = new URL(raw);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid URL');
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('Use HTTPS for a deployed site.');
  }
  url = new URL('/api/backups', base);
} catch (error) {
  console.error(`Invalid deployment URL: ${error.message}`);
  process.exit(2);
}
try {
  const res = await fetch(url, { method: 'GET', redirect: 'manual', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = null; }
  const version = parsed?.implementation || (parsed?.mode === 'manual-download' ? 'manual-download (older)' : null);
  console.log(`Backup API URL : ${url}`);
  console.log(`HTTP status    : ${res.status}`);
  console.log(`Content-Type   : ${contentType || '(missing)'}`);
  if (version) console.log(`Implementation : ${version}`);
  if (res.status === 404) {
    console.error('\nFAIL: The deployed site does not serve GET /api/backups. This is a missing/stale route, not a billing or backup-history problem.');
    console.error('Check Vercel Settings > Build and Deployment: Framework = Next.js, Root Directory = actual app folder, Output Directory override = blank.');
    console.error('Commit and deploy app/api/backups/route.ts AND src/components/admin/Backups.tsx; verify the latest production deployment source.');
    process.exitCode = 1;
  } else if ([301, 302, 303, 307, 308].includes(res.status)) {
    console.error('\nCHECK: A redirect intercepted /api/backups. Review redirects, protection and routing.');
    process.exitCode = 1;
  } else if (res.status === 401 || res.status === 403) {
    if (!contentType.includes('application/json') || !parsed || typeof parsed.error !== 'string') {
      console.error('\nCHECK: Authentication/protection intercepted the API; expected a JSON auth/permission response. Verify the deployment.');
      process.exitCode = 1;
    } else console.log('\nPASS: The API route exists and protects its data. Sign in with backups.manage to test downloading.');
  } else if (res.status === 200) {
    if (parsed?.mode === 'manual-download') console.log('\nPASS: The simple manual backup endpoint is deployed.');
    else { console.error('\nFAIL: This is not the simple manual backup API. The deployed backend is outdated.'); process.exitCode = 1; }
  } else if (res.status >= 500) {
    console.error('\nFAIL: API is deployed but had a server error. Inspect Vercel runtime logs and DATABASE_URL.');
    process.exitCode = 1;
  } else {
    console.error('\nCHECK: Unexpected response. Inspect the deployment and any middleware or rewrites.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Unable to connect: ${error.message}`);
  process.exitCode = 1;
}
