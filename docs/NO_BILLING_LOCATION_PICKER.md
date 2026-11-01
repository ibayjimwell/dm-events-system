# Venue location picker — no prepayment or Google Cloud account

The client booking wizard and administrator/coordinator walk-in booking wizard use **one shared** `VenueLocationPicker`. It is based on Leaflet, OpenStreetMap tiles, and the Photon geocoding service. Both booking endpoints continue storing the existing `venue`, `venue_latitude`, and `venue_longitude` values; **no SQL migration is needed**.

## Installation / deployment

1. Use the source files in this archive. **No new npm dependencies** were added; the picker lazily loads a pinned Leaflet 1.9.4 script/CSS from unpkg when someone opens the map.
2. Run `npm ci`, then `npm run dev` or your existing deployment build. On Vercel, redeploy so `app/api/locations/route.ts` is deployed.
3. Delete `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `RESTRICTED_GOOGLE_MAPS_KEY` from the deployment configuration if they are no longer used by any other service. They are **not needed** by the replacement picker.
4. No credit card, Google Maps API key, Cloud billing account, or Google Maps migration is required.
5. Optionally set `PHOTON_ENDPOINT` (server-only) if you later use your own Photon instance. Default is `https://photon.komoot.io`.

## User workflows

- In Client > New Booking, or Administrator/Coordinator > Walk-in, open the **Event location / venue** step and click **Pick on map**.
- Enter a venue, barangay or city, then press **Search**. Pick a result, or zoom/pan the map and tap a spot; the blue pin can be dragged.
- Search only starts on the Search button; it does not hit community geocoding servers for every keystroke.
- A pin triggers a reverse address lookup when possible. If unavailable, coordinates remain selected and the address is editable. Confirm using **Use this location**.
- Typing directly into the booking form remains supported and clears the previously stored coordinates, preventing misleading pins.
- Existing booking details now link to the corresponding location on openstreetmap.org rather than Google Maps.

## Community usage requirements / caveats

- OpenStreetMap tile server: <https://operations.osmfoundation.org/policies/tiles/>. Attribution is present on the map. No bulk download/prefetch or offline mode is implemented. Public tiles are best-effort, not guaranteed for business uptime. Browser referrer must be allowed, so do not change the existing `strict-origin-when-cross-origin` header to `no-referrer`.
- Photon public demo: <https://github.com/komoot/photon>. Limited, reasonable use is permitted, but the demo is throttled and comes without uptime guarantees. A same-origin API route validates requests, caches recent results, applies per-process rate limiting, and uses a timeout. **Serverless instances do not share this quota**; add centrally enforced rate limiting and a dedicated geocoding deployment for high traffic.
- Third-party public services may see searches or approximate coordinates. Do not send private contact or attendee data to geocoding queries. Only address search or clicked coordinates are sent.
- Map tiles and Photon require an internet connection (although no payment account). If offline, users can still manually enter a venue address.
- Leaflet assets load from the pinned unpkg CDN. If corporate networks block CDNs, self-host the same Leaflet version's assets under `/public` and replace `LEAFLET_CSS` and `LEAFLET_JS` in the picker.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm run test:spa`
- Browser test both client and walk-in flows, including search, tap, drag, manual venue entry, saved coordinates, and links shown to clients and coordinators.
