// Fast route-contract tests without database or live gateways.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');

function loadRoute(file, mocks) {
  const input = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  const source = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const context = {
    exports, Buffer, process, console,
    require: (name) => name === 'node:crypto' ? crypto : (mocks[name] ?? (() => {throw Error(`Unexpected: ${name}`)})()),
  };
  vm.runInNewContext(source, context, { filename: file });
  return exports;
}

const app = {
  '@/lib/http': {
    route: (handler) => handler,
    ok: (value) => value,
    HttpError: class HttpError extends Error { constructor(status, message) {super(message);this.status=status;} },
  },
};

test('manual dispatcher cannot send to arbitrary recipients and limits batch size', async () => {
  let granted = false;
  let attemptedLimit = 0;
  let audited = false;
  const route = loadRoute('app/api/notifications/dispatch/route.ts', {
    ...app,
    '@/lib/access': { requirePermission: async (name) => {assert.equal(name, 'settings.manage');granted=true;return {id:'staff-id'};} },
    '@/lib/auth': { checkAuthLimit: async () => {}, audit: async () => {audited=true;} },
    '@/lib/notifications/worker': { processNotifications: async (limit) => {attemptedLimit=limit;return {claimed:1,accepted:1,retried:0,failed:0};} },
  });
  const result = await route.POST();
  assert.equal(granted,true);
  assert.equal(attemptedLimit,2);
  assert.equal(result.accepted,1);
  assert.equal(audited,true);
});

test('diagnostic email only sends to signed-in account address, without a request-supplied recipient', async () => {
  process.env.PYTHON_MAIL_URL='https://mail.example.com/api';
  process.env.PYTHON_MAIL_SECRET='x'.repeat(40);
  let recipient;
  const route = loadRoute('app/api/notifications/test-email/route.ts', {
    ...app,
    '@/lib/access': { requirePermission: async () => ({id:'staff-id',email:'staff@example.com'}) },
    '@/lib/auth': { checkAuthLimit: async () => {}, audit: async () => {} },
    '@/lib/notifications/providers': {
      DeliveryError: class DeliveryError extends Error {},
      postToPython: async (_url, _secret, body) => {recipient=JSON.parse(body).to;return 'test';},
    },
  });
  const result = await route.POST({json: async () => ({to:'attacker@example.com'})});
  assert.equal(result.accepted,true);
  assert.equal(recipient,'staff@example.com');
});

test('cron route requires bearer auth and supports Vercel CRON_SECRET', async () => {
  process.env.CRON_SECRET='v'.repeat(48);
  delete process.env.NOTIFICATIONS_CRON_SECRET;
  let executed=false;
  const route = loadRoute('app/api/cron/notifications/route.ts', {
    ...app,
    '@/lib/notifications/worker': { processNotifications: async (limit) => {assert.equal(limit,2);executed=true;return {claimed:0};} },
  });
  await assert.rejects(
    () => route.GET({headers: {get: () => 'Bearer wrong'}}),
    /Unauthorized/,
  );
  assert.equal(executed,false);
  const result = await route.GET({headers: {get: () => `Bearer ${process.env.CRON_SECRET}`}});
  assert.equal(result.claimed,0);
  assert.equal(executed,true);
});
