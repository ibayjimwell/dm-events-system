// Node built-in tests; TypeScript is a project's devDependency.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

function loadWithMockFetch(fetchMock, abortSignal = AbortSignal) {
  const input = fs.readFileSync('src/lib/notifications/providers.ts', 'utf8');
  const source = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const context = { exports, require: (id) => {
    if (id === 'node:crypto') return crypto;
    throw new Error(`Unexpected runtime dependency: ${id}`);
  }, process, fetch: fetchMock, URL, AbortSignal: abortSignal, Date, Intl, console };
  vm.runInNewContext(source, context, { filename: 'providers.js' });
  return exports;
}
const payload = {
  kind: 'BOOKING_CREATED', bookingId: '11111111-1111-4111-8111-111111111111',
  reference: 'DEM-2026-ABCD', source: 'ONLINE', name: 'Client',
  eventType: 'Wedding', eventDate: '2026-11-28', status: 'TENTATIVE',
};

test('httpSMS uses official endpoint and E.164 number, without SMS credentials in client', async () => {
  process.env.HTTPSMS_API_KEY = 'test-server-secret';
  process.env.HTTPSMS_FROM = '+639123456789';
  let called = false;
  const client = loadWithMockFetch(async (url, options) => {
    called = true;
    assert.equal(url, 'https://api.httpsms.com/v1/messages/send');
    assert.equal(options.headers['x-api-key'], process.env.HTTPSMS_API_KEY);
    const body = JSON.parse(options.body);
    assert.equal(body.from, '+639123456789');
    assert.equal(body.to, '+639171234567');
    assert.equal(body.request_id, '11111111-1111-4111-8111-111111111111');
    assert.match(body.content, /Tentative/);
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 'gateway-id' } }) };
  });
  const result = await client.sendHttpSms('+639171234567', payload, payload.bookingId);
  assert.equal(result, 'gateway-id');
  assert.equal(called, true);
});

test('Python service receives HMAC signed JSON and no raw HTML', async () => {
  process.env.APP_URL = 'https://events.example.com';
  process.env.PYTHON_MAIL_URL = 'http://127.0.0.1:8765';
  process.env.PYTHON_MAIL_SECRET = 's'.repeat(48);
  const client = loadWithMockFetch(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8765/send');
    const expected = crypto.createHmac('sha256', process.env.PYTHON_MAIL_SECRET)
      .update(`${options.headers['X-DM-Timestamp']}.${options.body}`).digest('hex');
    assert.equal(options.headers['X-DM-Signature'], expected);
    const body = JSON.parse(options.body);
    assert.equal(body.to, 'recipient@example.com');
    assert.equal(body.template, 'booking');
    assert.equal(body.data.reference, payload.reference);
    assert.equal(body.data.booking_url, `https://events.example.com/client/bookings/${payload.bookingId}`);
    return { ok: true, status: 200, json: async () => ({status:'accepted'}) };
  });
  const acceptedId = await client.sendPythonEmail('recipient@example.com', payload);
  assert.match(acceptedId, /^[0-9a-f-]{36}$/);
});

test('walk-in bookings do not receive a private client-portal link', async () => {
  process.env.PYTHON_MAIL_URL = 'http://127.0.0.1:8765';
  process.env.PYTHON_MAIL_SECRET = 's'.repeat(48);
  const client = loadWithMockFetch(async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.data.booking_url, '');
    return { ok: true, status: 200, json: async () => ({status:'accepted'}) };
  });
  await client.sendPythonEmail('recipient@example.com', { ...payload, source: 'WALK_IN' });
});

test('httpSMS rejects invalid credentials without retrying the unauthorized request', async () => {
  process.env.HTTPSMS_API_KEY = 'test-server-secret';
  process.env.HTTPSMS_FROM = '+639123456789';
  const provider = loadWithMockFetch(async () => ({
    ok: false, status: 401, json: async () => ({ status: 'error' }),
  }));
  await assert.rejects(
    provider.sendHttpSms('+639171234567', payload, payload.bookingId),
    (e) => e.retryable === false && /401/.test(e.message),
  );
});

test('httpSMS 503 response is eligible for retry', async () => {
  process.env.HTTPSMS_API_KEY = 'test-server-secret';
  process.env.HTTPSMS_FROM = '+639123456789';
  const provider = loadWithMockFetch(async () => ({ ok: false, status: 503 }));
  await assert.rejects(
    provider.sendHttpSms('+639171234567', payload, payload.bookingId),
    (e) => e.retryable === true && /503/.test(e.message),
  );
});

test('httpSMS rejects API responses that did not acknowledge the request', async () => {
  process.env.HTTPSMS_API_KEY = 'test-server-secret';
  process.env.HTTPSMS_FROM = '+639123456789';
  const provider = loadWithMockFetch(async () => ({
    ok: true, status: 200, json: async () => ({ status: 'failed' }),
  }));
  await assert.rejects(provider.sendHttpSms('+639171234567', payload, payload.bookingId), /did not acknowledge/);
});

test('walk-in status/detail updates tell the client to contact DM Events, not log in', async () => {
  process.env.HTTPSMS_API_KEY = 'test-server-secret';
  process.env.HTTPSMS_FROM = '+639123456789';
  const provider = loadWithMockFetch(async (url, options) => {
    const body = JSON.parse(options.body);
    assert.doesNotMatch(body.content, /sign in/i);
    assert.match(body.content, /contact DM Events/i);
    return {ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 'accepted-id' }})};
  });
  const accepted = await provider.sendHttpSms('+639171234567', {
    ...payload, source: 'WALK_IN', kind: 'BOOKING_DETAILS_UPDATED',
  }, payload.bookingId);
  assert.equal(accepted, 'accepted-id');
});


test('Python HTTP timeout exceeds Gmail SMTP socket timeout to reduce duplicate retries', async () => {
  process.env.PYTHON_MAIL_URL = 'http://127.0.0.1:8765';
  process.env.PYTHON_MAIL_SECRET = 's'.repeat(48);
  let timeoutMs;
  const provider = loadWithMockFetch(async () => ({ ok: true, status: 200, json: async () => ({status:'accepted'}) }), {
    timeout(ms) {
      timeoutMs = ms;
      return AbortSignal.timeout(ms);
    },
  });
  await provider.sendPythonEmail('recipient@example.com', payload);
  assert.equal(timeoutMs, 25_000);
});


test('Vercel root URL resolves to /api/send and sends a valid HMAC request', async () => {
  process.env.PYTHON_MAIL_URL = 'https://dm-events-python-mail.vercel.app';
  process.env.PYTHON_MAIL_SECRET = 's'.repeat(48);
  const provider = loadWithMockFetch(async (url, opts) => {
    assert.equal(url, 'https://dm-events-python-mail.vercel.app/api/send');
    const wanted = crypto.createHmac('sha256', process.env.PYTHON_MAIL_SECRET)
      .update(`${opts.headers['X-DM-Timestamp']}.${opts.body}`).digest('hex');
    assert.equal(opts.headers['X-DM-Signature'], wanted);
    assert.equal(opts.redirect, 'error');
    return {ok:true,status:200,json:async()=>({status:'accepted'})};
  });
  assert.match(await provider.sendPythonEmail('client@example.com', payload), /^[a-f0-9-]{36}$/);
});

test('Python gateway accepts /api and complete /api/send URLs without duplication', async () => {
  const provider = loadWithMockFetch(async () => ({ok:true,status:200,json:async()=>({status:'accepted'})}));
  assert.equal(provider.resolvePythonMailEndpoint('https://example.vercel.app/api'), 'https://example.vercel.app/api/send');
  assert.equal(provider.resolvePythonMailEndpoint('https://example.vercel.app/api/send/'), 'https://example.vercel.app/api/send');
  assert.equal(provider.resolvePythonMailEndpoint('http://127.0.0.1:8765'), 'http://127.0.0.1:8765/send');
});

test('Python gateway rejects Markdown URL and remote non-HTTPS URL', async () => {
  const provider = loadWithMockFetch(async () => ({ok:true,status:200,json:async()=>({status:'accepted'})}));
  assert.throws(() => provider.resolvePythonMailEndpoint('[https://example.com](https://example.com)'), /invalid/i);
  assert.throws(() => provider.resolvePythonMailEndpoint('http://example.com'), /HTTPS/i);
});

test('401 from Python gateway identifies shared-secret mismatch and is not retryable', async () => {
  const provider = loadWithMockFetch(async () => ({ok:false,status:401,json:async()=>({error:'Unauthorized'})}));
  const savedLog = console.error;
  console.error = ()=>{};
  try {
    await assert.rejects(provider.postToPython('https://example.vercel.app', 'x'.repeat(32), '{}'), (err)=>err.retryable === false && /PYTHON_MAIL_SECRET/.test(err.message));
  } finally {console.error = savedLog;}
});

test('200 HTML fallback is not accepted as successful email delivery', async () => {
  const provider = loadWithMockFetch(async () => ({ok:true,status:200,json:async()=>{throw Error('not json')}}));
  const savedLog = console.error;
  console.error = ()=>{};
  try {
    await assert.rejects(provider.postToPython('https://example.vercel.app', 'x'.repeat(32), '{}'), /did not confirm/);
  } finally {console.error = savedLog;}
});
