/** Check whether the running Next.js deployment serves the backup API. */
const base = process.argv[2] || 'http://localhost:3000';
let url;
try {
  url = new URL('/api/backups', base);
  if (!['http:', 'https:'].includes(url.protocol)) throw Error();
} catch {
  console.error('Usage: node scripts/check-backup-route.mjs [http://localhost:3000]');
  process.exit(2);
}

try {
  const response = await fetch(url, { method: 'GET', redirect: 'manual', cache: 'no-store' });
  if (response.status === 404) {
    console.error('The backup API route returned 404. Check that the deployed app includes app/api/backups/route.ts, then rebuild and redeploy.');
    process.exitCode = 1;
  } else if ([401, 403].includes(response.status)) {
    console.log(`Backup API route is available (HTTP ${response.status}; authentication or permission required).`);
  } else if (response.ok) {
    console.log(`Backup API route is available (HTTP ${response.status}).`);
  } else if ([301, 302, 303, 307, 308].includes(response.status)) {
    console.log(`The server redirected the request (HTTP ${response.status}); verify that the redirect goes to login, not an error page.`);
  } else {
    console.error(`Backup API responded with HTTP ${response.status}. Check server logs.`);
    process.exitCode = 1;
  }
} catch {
  console.error('Could not connect to the application. Start Next.js or verify the deployment URL.');
  process.exitCode = 1;
}
