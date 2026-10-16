# Říčany Free Bus Router — Design Spec (Stage A)

Date: 2026-10-15
Status: Draft for review

## 1. Purpose

Říčany residents ride MHD Říčany lines **1, 2, 3, 7, 9, 91, 92** for free, but no journey
planner restricts itself to those lines. Mapy.com and others mix in paid regional lines
(364, 385, …), forcing manual verification. This project is a small "Mapy.com for the free
Říčany buses": a mobile-first web app that plans trips using **only** the free lines (plus
walking), shows live delays, departure boards, line timetables, and Nextbike stations.

### Stages
- **A (this spec):** personal/friends tool, €0 hosting, fully functional.
- **B (later):** public-grade polish for residents; live bus positions on the map.
- **C (later):** quality high enough to pitch to the city / Mapy.com.

Stage A must be built so B and C extend it without a rewrite.

### Success criterion (headline)
From "my location" to a destination in ≤ 3 taps, the user sees only free-line trips with
departure times and live delays.

## 2. Verified data sources (checked 2026-10-15)

| Source | URL | Notes |
|---|---|---|
| PID GTFS (static) | `https://data.pid.cz/PID_GTFS.zip` | ~51 MB zip, ~14-day validity window, regenerated daily. Free lines are route_ids **L1731–L1737** (`route_short_name` "MHD 1", "MHD 2", "MHD 3", "MHD 91", "MHD 92", "MHD 7", "MHD 9"). ~295 trips, 95 stop platforms. |
| PID GTFS-RT trip updates | `https://api.golemio.cz/v2/vehiclepositions/gtfsrt/trip_updates.pb` | Public, no key, CORS `*`, ~3.5 MB per fetch (all of PID). |
| PID GTFS-RT vehicle positions | `https://api.golemio.cz/v2/vehiclepositions/gtfsrt/vehicle_positions.pb` | Public, ~0.5 MB. Used in Stage B. |
| Nextbike live | `https://api.nextbike.net/maps/nextbike-live.json?city=736` | Říčany = city uid **736** (~40 stations), CORS `*`, ~36 KB. |
| Map tiles | OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`) | Free, no key, vector tiles for MapLibre. |
| Geocoding | Photon (`https://photon.komoot.io/api`) | OSM-based, autocomplete allowed (fair use). Biased to Říčany via `lat`/`lon` + `bbox`. |

**Critical rule:** the free-line filter is by **route_id**, never by `route_short_name` —
Benešov (L1761–) and Kolín (L1781–) also have routes named "MHD 1", "MHD 2", etc.

Nominatim is explicitly **not** used: its usage policy forbids autocomplete.

## 3. Architecture

```
GitHub repo PokeyPoke/ricany-bus
├── app/        Svelte 5 + TypeScript + Vite PWA   → GitHub Pages
├── pipeline/   Node/TS script: GTFS → compact JSON → nightly GitHub Action
├── worker/     Cloudflare Worker: live-delay proxy → deployed by GitHub Action (wrangler)
└── docs/
```

- No server of our own. Everything except the Worker is static.
- Hosting: GitHub Pages (site), Cloudflare Workers free tier (proxy), GitHub Actions (CI, data
  refresh, deploys). Cloudflare account: the owner's account; Worker deploy uses a
  Cloudflare API token stored as a GitHub Actions secret.

### 3.1 Data pipeline (`pipeline/`)

Runs nightly (cron ~04:30 Europe/Prague, after PID's daily regeneration) and on manual dispatch.

1. Download `PID_GTFS.zip`.
2. Keep trips whose `route_id ∈ {L1731…L1737}`; keep their `stop_times`, the stops they
   touch, `calendar`/`calendar_dates` for their services, and their `shapes`.
3. Precompute walking transfers between free-line stops ≤ 400 m apart (straight line).
4. Emit to `app/public/data/`:
   - `stops.json` — id, name, platform code, lat/lon, served line ids, transfer list.
   - `lines.json` — route id, display number, color, ordered stop list per direction, shape
     polyline (simplified).
   - `timetable.json` — trips grouped by route+direction: service id, stop-time arrays
     (minutes after midnight, compact), plus resolved calendar → list of active service ids
     per date for the feed window.
   - `meta.json` — feed publish date, validity start/end, generation timestamp.
5. **Validation gate:** all 7 route_ids present; trip count within sane bounds (e.g. 150–600);
   ≥ 7 days of validity remaining; every stop has coordinates. On failure the job fails and
   commits nothing — the previously deployed data stays live.
6. Commit changed data → triggers site build/deploy.

Target total data size: < 500 KB uncompressed.

### 3.2 Live-delay Worker (`worker/`)

- `GET /delays` → fetches `trip_updates.pb` (edge-cached ~20 s), decodes protobuf, keeps
  only entities whose `trip.route_id` ∈ free set (or trip_id in the free trip set), returns
  JSON `{ generatedAt, trips: { [tripId]: { delaySec, stopDelays?: {[stopSeq]: delaySec} } } }`.
- CORS `*`, `Cache-Control: max-age=15`.
- Upstream failure → `503` with JSON error; client falls back to scheduled times.
- Stage B adds `GET /positions` from `vehicle_positions.pb`.
- No API keys needed (public feeds).

### 3.3 Client (`app/`)

- Loads `meta/stops/lines/timetable` once; service worker caches them and the app shell for
  offline use (stale-while-revalidate on data).
- Router runs in a **Web Worker**.
- Live data (Worker `/delays`, Nextbike) fetched only while a screen that needs it is open;
  delays every 30 s, Nextbike every 60 s.

## 4. Routing engine

### Inputs
Origin and destination as lat/lon (from geocoder, map tap, GPS, saved place, or stop), plus
mode **Odjezd teď / Odjezd v / Příjezd do** (depart now / depart at / arrive by).

### Walking model (Stage A, no street routing)
- Distance = haversine × 1.3 detour factor; speed 4.5 km/h. Shown as "≈ N min".
- Access/egress: all free-line stops within 1.2 km of origin/destination.
- Transfers: precomputed footpaths ≤ 400 m between stops; same-stop transfer min 1 min.

### Bus-only search
- **RAPTOR**, max 3 rides (2 transfers).
- Pareto set over (arrival time, number of rides); departure-time tie-break: later departure
  preferred (less waiting).
- Arrive-by: repeated forward RAPTOR over candidate departure times (latest first) within
  3 h before the target, keeping journeys that arrive by the target. Same results as reverse
  RAPTOR, far less code, trivially fast at ~300 trips/day.
- All PID free-line stop_times have pickup/drop-off type 3 ("na znamení", request stop);
  only type 1 would forbid boarding/alighting and none exist, so types are ignored.
- If a depart-at search finds no free trip (evening, Sundays — the lines don't run on
  Sundays), search the next 2 service days from 00:00.
- Service days: trips are active per resolved calendar for the date; searches near midnight
  also scan the previous service day for trips with stop times ≥ 24:00.

### Nextbike legs
- Bike may be the **first** leg (walk → station → ride → station → walk → stop → bus…) or the
  **last** leg (…bus → stop → walk → station → ride → station → walk). Max one bike leg.
- Pickup station must have `bikes > 0` **now**; drop-off station any station in city 736.
- Ride time: haversine × 1.3 at 14 km/h, + 1 min rental + 1 min return.
- Implemented as extra access/egress options fed into RAPTOR.
- **Bike-only** option computed separately (walk → station → ride → station → walk).
- Availability is a snapshot; UI labels it "kola k dispozici teď" (bikes available now).

### Result ranking & grouping
1. **🆓 Zdarma** — bus + walk Pareto results, up to 4, sorted by arrival.
2. **🚲 S Nextbike (placené)** — mixed results that beat the best free result by ≥ 5 min, plus
   the bike-only option. Always labeled as not free.
3. **🚶 Pěšky** — walk-only if ≤ 30 min.

### Live delays in results
Plans use the timetable. Live delays are overlaid per bus leg ("+3 min"). If overlaid delays
make a transfer < 1 min, the itinerary shows ⚠️ "přestup může ujet" (transfer at risk).

### Performance
< 100 ms per query on a mid-range phone.

## 5. UI

Mobile-first; full-screen map with a draggable bottom sheet (left side panel on desktop).

- **Top bar:** search field ("Kam jedete?"), CZ|EN toggle.
- **Map:** free lines in color with stops; Nextbike layer (toggle); 📍 my-location button.
- **Sheets:**
  - **Home** — saved-place chips (🏠 Domů, 💼 Práce, ＋), recent searches, chips for the 7 lines.
  - **Planner** — From/To (geocoder autocomplete, tap-on-map, 📍), time mode picker, swap.
    Results grouped per §4.
  - **Trip detail** — step timeline with times and live delays; route drawn on map; stops
    tappable.
  - **Departure board** (tap a stop) — next ~10 departures with live delay, 30 s refresh,
    nearest Nextbike station with bike count.
  - **Line view** — highlighted route, ordered stops, timetable grid per stop (weekday/weekend).
  - **Nextbike station** — bikes, free docks, last update time, link to the Nextbike app.
- **Saved places** — stored in `localStorage` (try/catch guarded), no account.
- **i18n** — Czech default, English option, persisted. Stop names never translated.
- **Deep links** — hash routes `#/stop/:id`, `#/line/:num`, `#/trip?from=…&to=…&t=…`;
  back button works.
- **PWA** — installable; offline: timetable, routing, previously viewed map tiles. Map tiles
  are not bulk-precached.
- **Accessibility** — ≥ 44 px tap targets, line color always paired with number, WCAG AA
  contrast, light and dark themes.

## 6. Error handling

| Failure | Behavior |
|---|---|
| PID feed broken/stale overnight | Validation gate fails; previous data stays live. Banner "Jízdní řády mohou být neaktuální" when data has < 3 days left. |
| Worker/RT down | Scheduled times shown with "bez živých dat" marker. |
| Nextbike down | Bike layer greyed; bike results hidden with a note. |
| Geocoder down | Map-tap and stop picking still work; message in the search field. |
| GPS denied | 📍 explains how to enable; everything else works. |
| No route | "Žádné spojení zdarma" + walk-only / bike option / earlier-later shortcuts. |
| localStorage unavailable | App works; saved places just don't persist. |

## 7. Testing

- **Pipeline:** fixture GTFS subset — route_id filter (Benešov/Kolín "MHD n" excluded),
  calendar resolution, footpath computation, validation gate failure cases.
- **Router:** synthetic networks — direct, one transfer, walking transfer, 3-ride cap, Pareto
  retention, arrive-by, after-midnight, bike first/last leg, bike-only. **Golden tests** on real
  Říčany data: 5–10 A→B trips verified by hand against official PDF timetables.
- **Worker:** recorded `.pb` fixture → filtered JSON; upstream-failure path.
- **UI:** Playwright, mobile viewport — search → results → trip detail; departure board;
  line view; language switch; saved place persistence.
- **CI:** every push runs type check + tests; deploys gated on green.

## 8. Definition of done (Stage A)

1. ≤ 3 taps from "my location" to free-only results with times + live delays.
2. Every stop has a departure board; every line has a map view and timetable.
3. Nextbike stations show live counts; bike / bike+bus trips appear in a separate, labeled
   paid section.
4. Czech + English; saved places persist; installable PWA; offline timetables and routing.
5. Nightly data refresh with zero manual steps; a bad feed never breaks the live site.
6. Golden trips match PDFs.

## 9. Out of scope (Stage A)

- Live bus positions on the map (Stage B, via Worker `/positions`).
- Real street-network walking/cycling paths (consider OpenTripPlanner or OSRM in Stage C).
- Mapy.com tiles/geocoder (optional swap later; requires API key).
- Accounts, server-side storage, push notifications.
- Paid lines in any form.

## 10. Open items

- GitHub repo name: proposed `PokeyPoke/ricany-bus` (public, required for free Pages).
- Cloudflare API token for CI Worker deploys: to be created during implementation
  (scoped to Workers Scripts:Edit on the one account).
- Worker URL: default `*.workers.dev` subdomain in Stage A.
