const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function createRoute(fakeFetch) {
  const source = fs.readFileSync(path.join(__dirname, '../app/api/locations/route.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    require: (name) => {
      assert.equal(name, 'next/server');
      return { NextResponse: { json: (value, options = {}) => ({ value, status: options.status || 200 }) } };
    },
    fetch: fakeFetch,
    AbortController,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Date,
    Map,
    Number,
    String,
    Array,
    Math,
    Error,
    process: { env: {} },
  }, { filename: 'app/api/locations/route.ts' });
  return exports.GET;
}

function request(query, ip='test-ip') {
  const url = new URL('https://dm-events.example/api/locations' + query);
  return { nextUrl: url, headers: { get: (name) => name === 'x-forwarded-for' ? ip : null } };
}

const feature = {
  geometry: { coordinates: [120.62, 15.0794] },
  properties: { osm_type: 'N', osm_id: 123, name: 'Sample Venue', city: 'San Fernando', state: 'Pampanga', country: 'Philippines' },
};

test('search returns only normalized place fields and caches repeated queries', async () => {
  let calls = 0;
  const GET = createRoute(async (url) => {
    calls += 1;
    assert.match(url.toString(), /photon\.komoot\.io\/api\/\?/);
    return { ok: true, json: async () => ({ features: [feature] }) };
  });
  const first = await GET(request('?q=Sample%20Venue'));
  assert.equal(first.status, 200);
  assert.equal(first.value.places[0].lat, 15.0794);
  assert.equal(first.value.places[0].lng, 120.62);
  assert.match(first.value.places[0].address, /Sample Venue.*Pampanga/);
  assert.equal(first.value.places[0].id, 'N-123-0');
  const second = await GET(request('?q=sample%20venue'));
  assert.equal(second.status, 200);
  assert.equal(calls, 1, 'server-side cache prevents a second provider request');
});

test('reverse lookup preserves exact coordinates and gets a human-readable label', async () => {
  const GET = createRoute(async (url) => {
    assert.match(url.toString(), /photon\.komoot\.io\/reverse\?/);
    return { ok: true, json: async () => ({ features: [feature] }) };
  });
  const result = await GET(request('?lat=15.0794&lng=120.62'));
  assert.equal(result.status, 200);
  assert.match(result.value.address, /Sample Venue/);
});

test('rejects invalid parameters and limits requests to the public upstream', async () => {
  let calls = 0;
  const GET = createRoute(async () => {
    calls++;
    return { ok: true, json: async () => ({ features: [feature] }) };
  });
  assert.equal((await GET(request('?q=ab'))).status, 400);
  assert.equal((await GET(request('?lat=91&lng=12'))).status, 400);
  assert.equal((await GET(request('?lat=2&lng='))).status, 400);
  assert.equal(calls, 0);
  for (let i = 0; i < 12; i++) assert.equal((await GET(request('?q=search' + i, 'limit-me'))).status, 200);
  assert.equal((await GET(request('?q=one-more', 'limit-me'))).status, 429);
  assert.equal(calls, 12);
});

test('provider failure returns graceful 503, leaving map pin/manual venue entry usable', async () => {
  const GET = createRoute(async () => ({ ok: false, status: 503 }));
  const result = await GET(request('?q=somewhere'));
  assert.equal(result.status, 503);
  assert.match(result.value.error, /temporarily unavailable/);
});
