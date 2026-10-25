/**
 * DM Events Python Mail diagnostics.
 *
 * Usage (after npm install):
 *   node scripts/check-python-mail.mjs
 *   node scripts/check-python-mail.mjs --send-live --to=your-own-address@example.com
 *
 * Dry run only checks endpoint reachability and expected GET method rejection.
 * Sending is opt-in; never send credentials or recipient email into logs.
 */
import 'dotenv/config';
import { createHmac } from 'node:crypto';

function resolveEndpoint(input) {
  let u;
  try { u = new URL(input.trim()); }
  catch { throw new Error('PYTHON_MAIL_URL is not a valid plain URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname.toLowerCase());
  if ((u.protocol !== 'https:' && !(local && u.protocol === 'http:')) ||
      u.username || u.password || u.search || u.hash) {
    throw new Error('PYTHON_MAIL_URL must use HTTPS (except localhost), without credentials, query or fragment.');
  }
  const path = u.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') u.pathname = local ? '/send' : '/api/send';
  else if (path === '/api') u.pathname = '/api/send';
  else if (path === '/send' || path === '/api/send') u.pathname = path;
  else throw new Error('PYTHON_MAIL_URL path must be /, /api, /api/send or /send.');
  return u;
}

const raw = process.env.PYTHON_MAIL_URL;
if (!raw) {
  console.error('Missing PYTHON_MAIL_URL in this environment.');
  process.exitCode = 1;
} else {
  try {
    const endpoint = resolveEndpoint(raw);
    console.log(`Resolved Python Mail endpoint: ${endpoint.origin}${endpoint.pathname}`);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname.toLowerCase());
    if (!local) {
      const health = new URL('/api/health', endpoint);
      const probe = await fetch(health, { signal: AbortSignal.timeout(12000), redirect: 'manual' });
      const body = await probe.json().catch(() => null);
      console.log(`Health check: HTTP ${probe.status}`);
      if (!probe.ok || body?.status !== 'ok') {
        throw new Error('Python Mail health check failed. Confirm the URL and Vercel deployment.');
      }
    } else {
      console.log('Local Python HTTP server detected; skipping Vercel-only /api/health probe.');
    }
    const get = await fetch(endpoint, { signal: AbortSignal.timeout(12000), redirect: 'manual' });
    console.log(`GET /send method check: HTTP ${get.status} (expected 405)`);
    if (get.status !== 405) {
      throw new Error('The configured email endpoint did not return 405 for GET. Check Vercel routing or Deployment Protection.');
    }
    console.log('Endpoint routing OK. No email was sent.');

    if (process.argv.includes('--send-live')) {
      const to = process.argv.find(arg => arg.startsWith('--to='))?.slice('--to='.length)?.trim();
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        throw new Error('Add --to=your-own-address@example.com to send one live email.');
      }
      const secret = process.env.PYTHON_MAIL_SECRET;
      if (!secret || secret.length < 32) throw new Error('Set PYTHON_MAIL_SECRET (32+ characters).');
      const message = JSON.stringify({
        to,
        subject: 'DM Events | Python Mail connection test',
        template: 'generic',
        data: {
          heading: 'Email integration test',
          text: 'This is a signed test message from the DM Events Next.js project. No booking details were included.',
        },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', secret).update(`${timestamp}.${message}`).digest('hex');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-DM-Timestamp': timestamp,
          'X-DM-Signature': signature,
        },
        body: message,
        redirect: 'manual',
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json().catch(() => null);
      console.log(`Live SMTP handoff: HTTP ${response.status}`);
      if (response.status === 200 && result?.status === 'accepted') {
        console.log('Gmail SMTP accepted the test message. Check your recipient inbox and spam folder.');
      } else if (response.status === 401) {
        throw new Error('HTTP 401: PYTHON_MAIL_SECRET differs between the two services.');
      } else if (response.status === 503) {
        throw new Error('HTTP 503: Check Gmail App Password and Python Mail Vercel runtime logs.');
      } else {
        throw new Error(`Python Mail did not accept the test email (HTTP ${response.status}).`);
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'Python Mail diagnostic failed.');
    process.exitCode = 1;
  }
}
