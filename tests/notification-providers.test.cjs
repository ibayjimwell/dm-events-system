// Node built-in tests; TypeScript is a project's devDependency.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

function loadWithMockFetch(fetchMock) {
  const input = fs.readFileSync('src/lib/notifications/providers.ts', 'utf8');
  const source = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const context = { exports, require: (id) => {
    if (id === 'node:crypto') return crypto;
    throw new Error(`Unexpected runtime dependency: ${id}`);
  }, process, fetch: fetchMock, URL, AbortSignal, Date, Intl, console };
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
    return { ok: true, status: 200 };
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
    return { ok: true, status: 200 };
  });
  await client.sendPythonEmail('recipient@example.com', { ...payload, source: 'WALK_IN' });
});
