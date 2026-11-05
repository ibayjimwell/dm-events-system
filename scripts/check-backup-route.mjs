#!/usr/bin/env node
// Probe without an authenticated cookie: 401/403 means the API route exists.
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
try {
  const response = await fetch(`${base}/api/backups`, { method: 'GET', redirect: 'manual' });
  const type = response.headers.get('content-type') || '';
  console.log(`GET ${base}/api/backups: HTTP ${response.status}, ${type}`);
  if (response.status === 404) {
    console.error('404: /api/backups is not deployed. Check .gitignore (/backups/), tracked routes, root directory and deployed commit.');
    process.exitCode = 1;
  } else if ([401, 403].includes(response.status)) {
    console.log('PASS: Route exists and authorization is protecting it.');
  } else if (response.ok) {
    console.log('PASS: API responded.');
  } else {
    console.error('Route exists but returned an error; review Vercel function logs.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Could not connect:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
