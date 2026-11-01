import { NextRequest, NextResponse } from 'next/server';

/**
 * Small, user-triggered proxy for Photon (https://github.com/komoot/photon).
 * No API key or payment is required. This public endpoint is a best-effort demo
 * service; use a dedicated/hosted Photon instance if DM Events grows.
 * Search is initiated by a submit button, NEVER as autocomplete.
 */
export const runtime = 'nodejs';

const PHOTON_ENDPOINT = process.env.PHOTON_ENDPOINT || 'https://photon.komoot.io';
const CACHE_TIME_MS = 10 * 60 * 1000;
const MAX_CACHE_ITEMS = 150;
const MAX_CLIENT_REQUESTS = 12;
const CLIENT_WINDOW_MS = 60_000;
const cache = new Map<string, { until: number; data: unknown }>();
const clients = new Map<string, { since: number; count: number }>();

type Feature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};
type PhotonResponse = { features?: Feature[] };

function stringProp(props: Record<string, unknown>, name: string): string {
  const value = props[name];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function featureToPlace(feature: Feature, index: number) {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const props = feature.properties || {};
  const street = [stringProp(props, 'housenumber'), stringProp(props, 'street')].filter(Boolean).join(' ');
  const parts = ['name', 'district', 'city', 'county', 'state', 'country'].map(key => stringProp(props, key));
  const address = [...(street ? [street] : []), ...parts]
    .filter((part, i, list) => !!part && list.findIndex(other => other.toLowerCase() === part.toLowerCase()) === i)
    .join(', ')
    .slice(0, 2000);
  const id = [stringProp(props, 'osm_type'), stringProp(props, 'osm_id'), index].filter(value => value !== '').join('-');
  return { id, lat, lng, address: address || `${lat.toFixed(6)}, ${lng.toFixed(6)}` };
}

async function queryPhoton(path: '/api/' | '/reverse', params: URLSearchParams): Promise<PhotonResponse> {
  const url = new URL(path, `${PHOTON_ENDPOINT.replace(/\/$/, '')}/`);
  url.search = params.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'DMEventsVenuePicker/1.0 (OpenStreetMap Photon geocoding; contact via DM Events website)' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Location provider is currently unavailable.');
    const body = await response.json() as PhotonResponse;
    if (!body || !Array.isArray(body.features)) throw new Error('Invalid location provider response.');
    return body;
  } finally { clearTimeout(timeout); }
}

function withinBudget(request: NextRequest): boolean {
  // Lightweight per-process defense, not a global distributed quota. Operators
  // should add edge/WAF rate limiting if exposing this route to high traffic.
  const raw = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const client = raw.slice(0, 80);
  const now = Date.now();
  if (clients.size > 1000) {
    for (const [key, entry] of clients) if (now - entry.since > CLIENT_WINDOW_MS) clients.delete(key);
  }
  const state = clients.get(client);
  if (!state || now - state.since > CLIENT_WINDOW_MS) { clients.set(client, { since: now, count: 1 }); return true; }
  if (state.count >= MAX_CLIENT_REQUESTS) return false;
  state.count += 1;
  return true;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';
  const latInput = request.nextUrl.searchParams.get('lat');
  const lngInput = request.nextUrl.searchParams.get('lng');
  const reverse = latInput !== null || lngInput !== null;
  if (reverse ? (latInput === null || lngInput === null) : (q.length < 3 || q.length > 120)) {
    return NextResponse.json({ error: reverse ? 'Latitude and longitude are required.' : 'Search must be between 3 and 120 characters.' }, { status: 400 });
  }
  const lat = Number(latInput);
  const lng = Number(lngInput);
  if (reverse && (!latInput?.trim() || !lngInput?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
    return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 });
  }
  const key = reverse ? `r:${lat.toFixed(5)}:${lng.toFixed(5)}` : `s:${q.toLowerCase()}`;
  const existing = cache.get(key);
  if (existing && existing.until > Date.now()) return NextResponse.json(existing.data);
  if (!withinBudget(request)) return NextResponse.json({ error: 'Too many location requests. Please try again in a minute.' }, { status: 429 });

  try {
    const params = reverse
      ? new URLSearchParams({ lat: String(lat), lon: String(lng), limit: '1', lang: 'en' })
      : new URLSearchParams({ q, limit: '6', lang: 'en', bbox: '116,4,127,22', lat: '15.0794', lon: '120.6200' });
    const result = await queryPhoton(reverse ? '/reverse' : '/api/', params);
    const places = result.features!.map(featureToPlace).filter((item): item is NonNullable<typeof item> => item !== null);
    const data = reverse ? { address: places[0]?.address || '' } : { places };
    if (cache.size >= MAX_CACHE_ITEMS) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + CACHE_TIME_MS, data });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'Location search is temporarily unavailable. You can still mark a spot and type the address manually.' }, { status: 503 });
  }
}
