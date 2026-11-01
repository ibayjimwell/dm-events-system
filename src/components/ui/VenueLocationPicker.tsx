'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle, MapPin, Search, X, LocateFixed, Move, CheckCircle2 } from 'lucide-react';

/**
 * No billing account or API key is required.
 * Leaflet 1.9.4 is loaded on demand from a version-pinned CDN. Map tiles come
 * from OpenStreetMap; place search/reverse lookup uses our same-origin endpoint.
 * Both public providers are best-effort and subject to their usage policies.
 */
export type Coordinates = { lat: number; lng: number };
export type VenueSelection = Coordinates & { address: string };

type LeafletPoint = { lat: number; lng: number };
type LeafletMarker = {
  setLatLng: (point: [number, number]) => LeafletMarker;
  getLatLng: () => LeafletPoint;
  addTo: (map: LeafletMap) => LeafletMarker;
  on: (event: string, callback: () => void) => LeafletMarker;
};
type LeafletMap = {
  setView: (point: [number, number], zoom: number) => LeafletMap;
  flyTo: (point: [number, number], zoom: number) => LeafletMap;
  on: (event: string, callback: (event: { latlng: LeafletPoint }) => void) => LeafletMap;
  invalidateSize: () => void;
  remove: () => void;
};
type LeafletAPI = {
  map: (element: HTMLElement, options: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options: Record<string, unknown>) => { addTo: (map: LeafletMap) => void };
  marker: (point: [number, number], options: Record<string, unknown>) => LeafletMarker;
};

declare global { interface Window { L?: LeafletAPI } }

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const PAMPANGA: [number, number] = [15.0794, 120.6200];
let leafletLoader: Promise<LeafletAPI> | null = null;

function loadLeaflet(): Promise<LeafletAPI> {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoader) return leafletLoader;
  leafletLoader = new Promise<LeafletAPI>((resolve, reject) => {
    if (!document.querySelector('[data-dm-leaflet-css]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = LEAFLET_CSS;
      stylesheet.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      stylesheet.crossOrigin = 'anonymous';
      stylesheet.dataset.dmLeafletCss = 'true';
      document.head.appendChild(stylesheet);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('The map library could not initialize.'));
    script.onerror = () => { script.remove(); reject(new Error('The map could not load. Check your internet connection or network restrictions.')); };
    document.head.appendChild(script);
  }).catch((error: unknown) => { leafletLoader = null; throw error; });
  return leafletLoader;
}

type Place = VenueSelection & { id: string };
type SearchResponse = { places?: Place[]; error?: string };
type ReverseResponse = { address?: string; error?: string };

const formatCoordinates = (lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

export default function VenueLocationPicker({ id, value, onChange, onSelect, coordinates = null, inputClassName = '' }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (location: VenueSelection) => void;
  coordinates?: Coordinates | null;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [picked, setPicked] = useState<VenueSelection | null>(null);
  const [address, setAddress] = useState('');
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const marker = useRef<LeafletMarker | null>(null);
  const pickCoordinates = useRef<((lat: number, lng: number) => void) | null>(null);
  const abortRequest = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const latestPicked = useRef<VenueSelection | null>(null);

  // Map selection is kept in a ref too so asynchronous reverse lookups and
  // drag handlers cannot accidentally operate on an outdated React closure.
  const selectPoint = (point: VenueSelection) => {
    latestPicked.current = point;
    setPicked(point);
    setAddress(point.address);
  };

  const close = () => {
    requestNumber.current += 1;
    abortRequest.current?.abort();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = oldOverflow;
      requestNumber.current += 1;
      abortRequest.current?.abort();
    };
    // `close` only changes state; this listener is intentionally tied to `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setMapLoading(true);
    setError('');
    setResults([]);
    setQuery('');
    setResolving(false);
    const original: VenueSelection | null = coordinates
      ? { ...coordinates, address: value || formatCoordinates(coordinates.lat, coordinates.lng) }
      : null;
    latestPicked.current = original;
    setPicked(original);
    setAddress(value);

    void (async () => {
      try {
        const L = await loadLeaflet();
        if (!alive || !mapElement.current) return;
        const start: [number, number] = original ? [original.lat, original.lng] : PAMPANGA;
        const map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: false }).setView(start, original ? 16 : 10);
        mapInstance.current = map;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        }).addTo(map);

        const placeMarker = (lat: number, lng: number) => {
          if (!marker.current) {
            marker.current = L.marker([lat, lng], { draggable: true }).addTo(map);
            marker.current.on('dragend', () => {
              const position = marker.current?.getLatLng();
              if (position) void lookupPoint(position.lat, position.lng);
            });
          } else marker.current.setLatLng([lat, lng]);
        };

        const lookupPoint = async (lat: number, lng: number) => {
          placeMarker(lat, lng);
          // Preserve the marker even if geocoding is down, slow, or rate-limited.
          const fallback = formatCoordinates(lat, lng);
          selectPoint({ lat, lng, address: fallback });
          abortRequest.current?.abort();
          const controller = new AbortController();
          abortRequest.current = controller;
          const currentRequest = ++requestNumber.current;
          setResolving(true);
          setError('');
          try {
            const response = await fetch(`/api/locations?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, { signal: controller.signal });
            const data = await response.json() as ReverseResponse;
            if (!response.ok) throw new Error(data.error || 'Address lookup unavailable');
            if (alive && currentRequest === requestNumber.current) {
              selectPoint({ lat, lng, address: data.address?.trim() || fallback });
            }
          } catch (caught) {
            if (alive && !controller.signal.aborted && currentRequest === requestNumber.current) {
              setError('Address lookup is unavailable. You can enter the venue address manually and still use this pin.');
            }
          } finally {
            if (alive && currentRequest === requestNumber.current) setResolving(false);
          }
        };

        pickCoordinates.current = (lat, lng) => void lookupPoint(lat, lng);
        if (original) placeMarker(original.lat, original.lng);
        map.on('click', event => pickCoordinates.current?.(event.latlng.lat, event.latlng.lng));
        // The modal may be animated or just becoming visible.
        requestAnimationFrame(() => { if (alive) map.invalidateSize(); });
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : 'Unable to load map. You can type a venue address instead.');
      } finally { if (alive) setMapLoading(false); }
    })();
    return () => {
      alive = false;
      requestNumber.current += 1;
      abortRequest.current?.abort();
      mapInstance.current?.remove();
      mapInstance.current = null;
      marker.current = null;
      pickCoordinates.current = null;
    };
    // Capture the current form state at the moment the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const searchPlaces = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 3) { setError('Enter at least 3 characters to search.'); return; }
    abortRequest.current?.abort();
    const controller = new AbortController();
    abortRequest.current = controller;
    const currentRequest = ++requestNumber.current;
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(term)}`, { signal: controller.signal });
      const data = await response.json() as SearchResponse;
      if (!response.ok) throw new Error(data.error || 'Location search is unavailable.');
      if (currentRequest === requestNumber.current) {
        setResults(data.places || []);
        if (!data.places?.length) setError('No matching place found. Try a nearby city, or tap the map to mark the venue.');
      }
    } catch (caught) {
      if (!controller.signal.aborted && currentRequest === requestNumber.current) {
        setError(caught instanceof Error ? caught.message : 'Location search failed. You can still tap the map.');
      }
    } finally { if (currentRequest === requestNumber.current) setSearching(false); }
  };

  const choosePlace = (place: Place) => {
    requestNumber.current += 1;
    abortRequest.current?.abort();
    setResolving(false);
    setError('');
    setResults([]);
    selectPoint(place);
    mapInstance.current?.flyTo([place.lat, place.lng], 16);
    if (window.L && mapInstance.current) {
      if (!marker.current) {
        marker.current = window.L.marker([place.lat, place.lng], { draggable: true }).addTo(mapInstance.current);
        marker.current.on('dragend', () => {
          const pos = marker.current?.getLatLng();
          if (pos) pickCoordinates.current?.(pos.lat, pos.lng);
        });
      } else marker.current.setLatLng([place.lat, place.lng]);
    }
  };

  return <div className="space-y-2">
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
      <input id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={2000} placeholder="Enter a venue or select a location on the map" className={`${inputClassName} min-w-0 flex-1`} />
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b7cbdc] bg-white px-4 text-sm font-semibold text-[#17486c] transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600"><MapPin size={17}/> Pick on map</button>
    </div>
    {coordinates && <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={14}/> Venue pinned ({formatCoordinates(coordinates.lat, coordinates.lng)})</p>}
    {open && <div role="dialog" aria-modal="true" aria-label="Choose event location" className="fixed inset-0 z-[200] flex items-end justify-center bg-[#071f3b]/75 p-0 sm:items-center sm:p-4" onMouseDown={event => { if (event.currentTarget === event.target) close(); }}>
      <div className="flex max-h-[96dvh] w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:max-h-[92dvh] sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-[#143a56]">Choose your event location</h2><p className="mt-1 text-xs text-slate-600">Search a place, tap the map, or drag the pin to set the exact venue. No Google Maps account is needed.</p></div><button type="button" aria-label="Close location picker" onClick={close} className="rounded-full border p-2"><X size={20}/></button></div>
        <form onSubmit={searchPlaces} className="flex gap-2">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search venue or location</span><Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-slate-500"/><input value={query} onChange={event => setQuery(event.target.value)} maxLength={120} placeholder="Search a venue, barangay or city" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600" /></label>
          <button type="submit" disabled={searching || query.trim().length < 3} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b4d98] px-4 text-sm font-semibold text-white disabled:opacity-50">{searching ? <LoaderCircle size={16} className="animate-spin"/> : <Search size={16}/>} Search</button>
        </form>
        {results.length > 0 && <ul aria-label="Location search results" className="max-h-44 overflow-auto rounded-xl border border-slate-200 bg-slate-50">{results.map(place => <li key={place.id}><button type="button" onClick={() => choosePlace(place)} className="flex w-full items-start gap-2 border-b border-slate-200 px-3 py-3 text-left text-sm text-slate-800 last:border-0 hover:bg-blue-50 focus-visible:bg-blue-50"><MapPin size={15} className="mt-0.5 shrink-0 text-blue-700"/><span>{place.address}</span></button></li>)}</ul>}
        <div className="relative min-h-[260px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-[#e7eff3] sm:min-h-[365px]">
          <div ref={mapElement} className="absolute inset-0 z-0" role="region" aria-label="Interactive OpenStreetMap. Tap or drag marker to set venue" />
          {mapLoading && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-slate-100/70 text-sm text-slate-700"><LoaderCircle className="animate-spin" size={19}/> Loading map…</div>}
        </div>
        <p className="flex items-center gap-2 text-xs text-slate-600"><Move size={15}/> Tap anywhere on the map, or drag the blue pin. Use the map controls to zoom. <LocateFixed size={14}/> Search focuses on the Philippines.</p>
        {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
        {resolving && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="animate-spin" size={16}/> Finding the closest address…</p>}
        {picked && <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3"><label htmlFor={`${id}-chosen-address`} className="block text-sm font-semibold text-[#173b58]">Selected location address (editable)</label><input id={`${id}-chosen-address`} maxLength={2000} value={address} onChange={event => setAddress(event.target.value)} placeholder="Enter venue name, street, barangay and city" className="min-h-11 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"/><p className="text-xs text-slate-600">Pinned coordinates: {formatCoordinates(picked.lat, picked.lng)}</p></div>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={close} className="min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={!picked || !address.trim()} onClick={() => { if (picked && address.trim()) { const confirmed = { ...picked, address: address.trim() }; onChange(confirmed.address); onSelect?.(confirmed); close(); } }} className="min-h-11 rounded-xl bg-[#0b4d98] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">Use this location</button></div>
        <p className="text-xs text-slate-500">Map © OpenStreetMap contributors · Search © OpenStreetMap contributors, powered by Photon. Public services are subject to fair-use limits.</p>
      </div>
    </div>}
  </div>;
}
