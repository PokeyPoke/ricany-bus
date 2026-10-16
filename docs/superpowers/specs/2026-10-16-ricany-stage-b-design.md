# Říčany Free Bus Router — Stage B Design Spec

Date: 2026-10-16
Status: Draft for review
Builds on: `docs/superpowers/specs/2026-10-15-ricany-free-bus-design.md` (Stage A, shipped).
Everything in the Stage A spec still binds unless this document changes it.

## 1. Goals

Stage B makes the app good enough for Říčany residents generally, and presentable to the city.

1. **Live buses on the map** (verified 2026-10-16: PID vehicle-positions feed carries ~9 free-line
   buses at 14:20 with lat/lon, bearing, speed, current stop sequence, trip id, route id, start date).
2. **Stops that are easy to read on the map**, and a **line view linked to the map** in both directions.
3. **"Kam pojedete?"** — from any chosen stop, pick a destination stop on the same line (one-tap
   direct-ride answer) or search any address (full planner).
4. **Worker hardening**: fits the Cloudflare free CPU budget, survives short PID outages, adds
   `/positions`, deploys from GitHub when a token is available.
5. **Public polish**: About page, share a trip, accessibility fixes, map-style fallback, real offline
   support, CI on Node 22, holiday-safe nightly gate, selected Stage A deferred fixes.
6. **Pitch-ready**: nicer icon/branding, Open Graph preview image. **No analytics** (privacy by default).

## 2. Stops on the map

### 2.1 Stop groups
Platforms sharing a display name (e.g. "Masarykovo nám." A and B) are merged into one **stop group**.
The pipeline emits `app/public/data/groups.json`:
```
{ groups: [{ id: string /* stable: first platform id */, name, lat, lon /* mean */, platforms: number[] /* stop indexes */, lines: FreeRouteId[] /* sorted by LINE_ORDER */ }] }
```
and each `StopRec` gains `group: number` (index into groups). The router keeps using platforms; the
map and UI show groups. Tapping a group opens the existing stop board (which already merges platforms).

### 2.2 Map rendering
- One marker per group: a white disc with a **ring of coloured segments**, one per serving line
  (line colours from `LINE_STYLE`). Ring icons are drawn once per distinct line combination on a
  canvas and registered with `map.addImage` (≤ ~20 combinations; key = joined route ids).
- Marker size by zoom: 12 → 14 px, 16 → 26 px. Names shown from zoom **14** (was 15), dark text with
  a 2 px white halo; collision-managed (`text-optional`).
- **Selected line** (line view open): its stops for the chosen direction are drawn as numbered markers
  (1, 2, 3… in the line's colour, white text) above everything else; other stops fade to 40 %.
- Hit area ≥ 44 px (invisible circle layer).

## 3. Line view ↔ map

- **Desktop**: hovering a stop row highlights it on the map (feature-state `hover` → marker scale 1.5
  and a pulsing halo); hovering a numbered marker highlights its row (`aria-current`-style class) and
  scrolls it into view if needed.
- **Mobile** (no hover): tapping a stop row = select it: highlight + pan the map to it + show its
  timetable (existing). Tapping a numbered marker while the line view is open selects that row
  instead of opening the stop board.
- The selected stop gets a **"Kam pojedete?" button** (§4).

## 4. "Kam pojedete?" (Where are you going?)

Opened from: the line view's selected stop, and the stop board's **"Jet odsud"** button (replaces its
current behaviour). Route: `#/from/:groupId?line=<number>&dir=<0|1>` (line/dir optional).

Panel contents, top to bottom:
1. Search field "Jiná adresa nebo místo…" (reuses PlaceInput). Choosing a result opens the planner
   with `from` = this stop group, `to` = the result.
2. **Next stops on this line** in the chosen direction (from the line view), or — from the stop board —
   one collapsible section per line serving the group (direction chosen by a small toggle). Each row:
   stop name and typical travel time `+N min` (from the next departing trip of that pattern; if none
   today, from the first trip on the sampled day).
3. Link "Hledat spojení s přestupem" → planner from this stop (no destination yet).

Tapping a downstream stop opens a **direct ride** view: `#/ride?line=&dir=&from=<groupId>&to=<groupId>`:
the next 6 departures of that line from the origin group that reach the destination group, each with
departure time, live delay, arrival time and duration; footer link to the full planner for the same
pair. New router function:
```
directRides(net: Network, routeId, directionId, fromStops: number[], toStops: number[], fromSec, limit): DirectRide[]
interface DirectRide { tripId; serviceDate; p; boardPos; alightPos; dep; arr; boardSeq; alightSeq; headsign }
```
(scans patterns of that route+direction where some fromStop precedes some toStop; rolls to the next
service day like departures do).

## 5. Live buses

### 5.1 Worker `/positions`
- Source `https://api.golemio.cz/v2/vehiclepositions/gtfsrt/vehicle_positions.pb` (~0.5 MB).
- Response:
```
{ generatedAt: number, vehicles: [{ id: string, label: string, tripId: string, routeId: FreeRouteId,
  startDate: string, lat: number, lon: number, bearing: number | null, speed: number | null,
  stopSeq: number | null, ts: number }] }
```
- Same memo/TTL (15 s), CORS and headers as `/delays`.

### 5.2 Worker hardening (both endpoints)
- **Pre-filter before decoding**: for each top-level `FeedEntity` (length-delimited), scan its raw
  bytes for the ASCII sequence `L173`; decode only matching entities. Target: decoding CPU ≤ 3 ms for
  a 3.5 MB trip-updates feed in Node on the dev Mac (measured in a test with the captured fixture
  scaled ×10, or a timing log in the report). Correctness: output identical to full decoding on the
  fixtures.
- **Stale-on-error**: if upstream fails and the memo is ≤ 120 s old, serve it with header
  `X-Stale: 1` (client treats it as live but shows nothing special); otherwise 503 as today.
  (This supersedes the Stage A ruling that kept 503-only.)
- **Upstream timeout** 8 s (AbortController).
- **Deploy from GitHub**: `.github/workflows/worker.yml` on push to `worker/**` or `shared/**`
  runs worker tests then `wrangler deploy` with secret `CLOUDFLARE_API_TOKEN`
  (scope: Account → Workers Scripts → Edit, this account only). The wrangler OAuth login cannot
  create API tokens (verified: 9109 Unauthorized), so the token is created by the controller via the
  owner's logged-in Cloudflare dashboard in Chrome if available; otherwise the workflow is committed
  but **skips deploy when the secret is absent** and manual deploy stays documented.

### 5.3 Client
- New poller `usePositions` (15 s) active while the map is visible **and** the tab is visible
  (all pollers pause on `document.hidden` and refresh immediately on return).
- Map layer `buses`: a rounded-square icon in the line colour with the line number (one canvas image
  per line), plus a small direction arrow rotated by `bearing` (separate symbol, `icon-rotate`).
  Hidden when positions are older than 3 min. Drawn above stops.
- Tap a bus → **bus sheet** `#/bus/:tripId`: line badge, headsign, delay (from `/delays`), and its next
  stops with ETA = scheduled + delay, current stop highlighted (from `stopSeq`). If the trip isn't in
  today's network, show line + headsign only.
- **Trip detail**: for each bus leg whose trip has a live vehicle, a line
  "🚌 autobus je teď u zastávky X" / "…je N zastávek od vás" and the vehicle marker pulses on the map.

## 6. Public polish

- **About sheet** `#/about` (ⓘ button in the top bar): what the app is; the free lines; wording
  "Linky MHD Říčany (1, 2, 3, 7, 9, 91, 92) jsou podle města bezplatné — aktuální podmínky ověřte na
  ricany.cz" with link; data sources and licences (PID/ROPID open data, OpenStreetMap/OpenFreeMap,
  Photon, Nextbike); disclaimer "Neoficiální aplikace, není spojena s městem Říčany ani PID";
  timetable validity (feedStart–feedEnd) and generated date; link to the GitHub repo. Czech + English.
- **Share a trip**: button in trip detail → Web Share API (`navigator.share({ title, url })`) with
  fallback copy-to-clipboard and a "Odkaz zkopírován" toast. URL = current hash route.
- **Accessibility**: PlaceInput as an ARIA combobox (`role=combobox`, `aria-expanded`,
  `aria-controls`, options `role=option`, arrow-key navigation, Enter selects); all tap targets ≥ 44 px
  (incl. saved-place ✕); `aria-current` on the selected line-view stop; text labels on icon-only
  headings; BottomSheet `aria-valuetext`; location button shows a pending state while locating.
- **Map-style fallback**: if the OpenFreeMap style hasn't loaded within 8 s or errors, switch to a
  built-in minimal style (background + our layers) so lines, stops and buses still show; small note
  "Mapa se nenačetla".
- **Offline**: precache `data/*.json` (with revisions) so the timetable and planner work offline from
  the first visit; verified by an e2e test with the service worker enabled and the context set offline
  after the first load.
- **CI**: Node 22 everywhere, `runs-on: ubuntu-24.04`.
- **Holiday-safe gate**: require ≥ 3 days with service in the next 10 (was 4 of 7).
- **Stage A deferred fixes folded in**: board keeps showing stale bike counts with an "aktualizováno
  před N min" warning after 5 min; `shift()` can roll past midnight to the next day; trip detail back
  returns with `history.back()` when the previous entry is the results list; first-click geolocation
  pending state.

## 7. Pitch-ready

- **Branding**: name stays "Říčany zdarma"; new SVG icon (bus front with "0 Kč" ticket motif, line
  colours stripe), regenerated PWA icons.
- **Open Graph / Twitter card**: `og:title`, `og:description`, `og:image` (1200×630 PNG
  `public/og.png`, generated by a script from an HTML template via Playwright and committed),
  `twitter:card=summary_large_image`.
- **No analytics or tracking** of any kind.

## 8. Error handling additions

| Failure | Behaviour |
|---|---|
| `/positions` down or stale > 3 min | Bus layer hidden; trip detail shows no live-position line |
| Bus tapped but trip unknown | Bus sheet shows line + headsign only |
| Direct ride: no departures in the next 2 service days | "Tato linka mezi zastávkami teď nejede" + link to planner |
| Map style fails | Fallback style + note (§6) |
| Share API missing | Copy link + toast; if clipboard blocked, show the URL selectable |

## 9. Testing

- **Worker**: positions decode/filter on a captured fixture; pre-filter output identical to full
  decode for both feeds; stale-on-error (≤120 s serves stale with `X-Stale`, older → 503); timeout path.
- **Pipeline**: groups.json (merging by name, mean position, lines order, `StopRec.group`); new gate.
- **Router/app units**: `directRides` (incl. next-day roll, branch patterns), downstream stops +
  typical `+N min`, ring-icon combination keys, positions freshness filter, share fallback.
- **E2E** (mocked externals incl. `/positions`): numbered markers + row↔marker sync on tap;
  "Kam pojedete?" → downstream stop → direct ride list; stop board "Jet odsud" opens the panel;
  bus icon tap → bus sheet; About page; share fallback toast; offline planner after first load;
  combobox keyboard selection.

## 10. Definition of done (Stage B)

1. Free-line buses appear on the live map within 30 s of the app opening during service hours, in
   line colours with direction; tapping one shows its next stops.
2. Stops render as one ring-marker per stop group with names from zoom 14; a selected line shows
   numbered stops linked to the list (hover on desktop, tap on mobile).
3. From any stop, ≤ 2 taps give the next direct departures to a chosen downstream stop.
4. Worker: pre-filtered decoding, stale-on-error, `/positions` live; GitHub deploy works or is
   explicitly skipped with the reason documented.
5. About page, share, a11y fixes, map fallback, offline-from-first-visit all verified (offline by e2e).
6. CI on Node 22; nightly refresh still green; OG preview renders (checked with a meta-tag test).
7. All tests green; deployed site verified on a phone-sized viewport.

## 11. Out of scope (Stage C)

Real street-network walking/cycling (OSRM/OTP), push notifications, accounts, Mapy.com tiles,
custom domain, smooth animation of bus movement between updates.
