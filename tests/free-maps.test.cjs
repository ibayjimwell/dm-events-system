const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('a single location picker serves clients and walk-ins without a Google API key', () => {
  const picker = read('src/components/ui/VenueLocationPicker.tsx');
  const wizard = read('src/components/client/BookingWizard.tsx');
  const walkin = read('src/components/shared/WalkInBooking.tsx');
  assert.match(picker, /tile\.openstreetmap\.org/);
  assert.match(picker, /leaflet@\$\{LEAFLET_VERSION\}/);
  assert.match(picker, /sha256-p4NxAoJBhIIN\+hmNHrzRCf9tD\/miZyoHS5obTRR9BMY=/);
  assert.match(picker, /sha256-20nQCchB9co0qIjJZRGuk2\/Z9VM\+kNiyxNV1lvTlZBo=/);
  assert.match(picker, /onSelect\?\.\(confirmed\)/);
  assert.match(picker, /onChange\(confirmed\.address\)/);
  assert.match(picker, /dragend/);
  assert.match(picker, /coordinates = null/);
  assert.match(wizard, /<VenueLocationPicker/);
  assert.match(wizard, /venueLatitude: venueCoordinates\?\.lat/);
  assert.match(walkin, /<BookingWizard walkInRole=\{role\}/);
  assert.doesNotMatch(picker, /maps\.googleapis\.com|NEXT_PUBLIC_GOOGLE/);
});

test('search runs on submit only, with a bounded Photon provider proxy', () => {
  const picker = read('src/components/ui/VenueLocationPicker.tsx');
  const route = read('app/api/locations/route.ts');
  assert.match(picker, /onSubmit=\{searchPlaces\}/);
  assert.match(route, /MAX_CLIENT_REQUESTS/);
  assert.match(route, /MAX_CACHE_ITEMS/);
  assert.match(route, /bbox: '116,4,127,22'/);
  assert.match(route, /AbortController/);
  assert.match(route, /status: 429/);
  assert.match(route, /status: 503/);
});

test('client and coordinator booking detail links point to OSM, not Google', () => {
  for (const file of ['src/components/client/BookedEventExperience.tsx','src/components/coordinator/ReviewRequest.tsx']) {
    const contents = read(file);
    assert.match(contents, /www\.openstreetmap\.org\//);
    assert.doesNotMatch(contents, /www\.google\.com\/maps/);
  }
});
