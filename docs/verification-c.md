# Stage C verification (street routing, smooth buses) — 2026-10-17

## Scope
Stage C items 1 and 2 from `docs/superpowers/specs/2026-10-16-ricany-stage-b-design.md` §11, staying on GitHub Pages (no server):
1. Walking and cycling routed along real streets.
2. Smooth animation of bus movement between position updates.

## Design
- **Street graph** (`npm run streets`, `pipeline/src/osm.ts` + `pipeline/src/streets.ts`): OSM `highway=*` ways in `RIC_BBOX` from Overpass (OSM API in 0.02° tiles as fallback), walk/bike flags per way (access, foot, bicycle, one-way incl. `oneway:bicycle`, contraflow cycleways, roundabouts), split at junctions, largest connected component only, Douglas–Peucker 1.5 m. Committed as `app/public/data/streets.json`: 9,372 nodes, 12,142 edges, 393 KB (133 KB gzip), precached for offline. Refreshed by hand, not nightly.
- **Routing** (`shared/src/streets.ts`): grid-indexed snapping (a point joins every street within 25 m of the nearest, up to 6, so separately mapped sidewalks don't force detours), bounded Dijkstra, path reconstruction. Used by the nightly `npm run data` for stop-to-stop transfer times and by the router worker (`app/src/router/ways.ts`) for access/egress walks, walk-only trips and Nextbike legs, whose paths are drawn on the map. Fallback to straight-line × 1.3 when the graph is missing, still loading (> 4 s) or a point is > 300 m from any street.
- **Smooth buses** (`app/src/map/motion.ts`): each report animates from the drawn position to the new one over the gap between reports (2–15 s), along the line's shape when both points are within 40 m of it; no animation on first sighting, jumps > 1.5 km or `prefers-reduced-motion`; ~20 fps loop only while a bus moves and the tab is visible.

## Evidence
- Unit tests: shared 18, pipeline 27, worker 19, app 126 — all green; `npm run typecheck` 0 errors; e2e 21/21 (Pixel 7, mocked externals).
- Real data (Pacov → south Říčany, weekday 08:00, 43 Nextbike stations): plan 25–32 ms straight-line vs 86 ms warm / 142 ms cold with streets (Node, this container).
- Stop transfers vs straight-line × 1.3: mean −5 s; largest increase +151 s (Pod Lihovarem ↔ Sofie). A first version snapped to a single street and routed Radošovice,sokolovna → nemocnice 448 m round a sidewalk; with multi-street snapping it is 224 m along the road (screenshots `scratchpad/transfer.png` vs `transfer2.png`, not in repo).
- Walk and Nextbike legs follow streets on the map (scratch screenshots `bus-detail.png`, `walk-detail.png`).
- Smooth buses: no free buses were running at test time (Worker `/positions` returned 0 vehicles), so this used a simulated line 3 bus advancing ~150 m along its shape every 15 s poll: over 40 s the drawn bus moved in 68 of 99 400-ms samples (max step 18 m, 489 m total) instead of three 150 m jumps, and stayed on the line (`scratchpad/sim.png`).

## Settle-first items
- **Worker CPU**: prefilter + decode + JSON, real feeds (trip updates 1.67 MB → 3.3 KB kept; positions 233 KB → 0.8 KB): median 1.1 ms / 0.4 ms, first (cold) run 5.7 ms / 1.3 ms, max 8.1 ms; decoding without the prefilter would take ~70 ms. Timed in Node locally, not on Cloudflare. 24/24 live requests to `/delays` and `/positions` returned 200 without `X-Stale`.
- **Worker deploy from GitHub**: the "Deploy Worker" workflow has never run (0 runs). It needs repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit) and `CLOUDFLARE_ACCOUNT_ID`; then run it once via *Actions → Deploy Worker → Run workflow*.

## Not verified
- Smooth movement with real buses (none running during the test); real-device feel and battery use.
- Street routing quality across the whole town beyond the spot checks above; the OSM data quality decides it.
- ~~Overpass from GitHub Actions~~ verified 2026-10-17: the first "Refresh street map" run fetched via Overpass (no fallback), 9,373 nodes / 12,144 edges, committed and deployed.

## Follow-up: route variants and parked buses (2026-10-17)
- **Route variants on the map.** Lines used to draw one route per direction (the variant with the most stops), so line 1's main Strašín ↔ Kuří route (25 trips/day) was missing behind the 8-trip OÁZA variant. Now each direction lists every variant that serves stops the others miss, most frequent first (only line 1 is affected: `→ Strašín | OÁZA → Strašín | → Kuří | → OÁZA`). `dir` in URLs and `lineSelection` is now an index into `LineRec.directions`.
- **Parked buses.** A line 1 bus was reported 454 m off its route: it was parked at Wolkerova on layover, already signed on to its next trip (12:44 from OÁZA). Buses whose trip has not reached its first departure are drawn at 45 % opacity and the bus sheet says "Čeká na odjezd: 13:14 ze zastávky Strašín" (verified with a simulated vehicle at that spot).

## Batch 3 (2026-10-17): polish and resident features
- **Bus legs follow the line**: planned bus legs are drawn stop to stop along the line shape (straight only where no shape fits).
- **Nextbike suggestions**: paid options (bike-only and bike + bus) appear only when ≥ 5 min better than every free option, walking included; previously an empty bus list let any bike option through (seen: bike + bus 45 min later for a 200 m walk).
- **No-service days**: home says "Dnes nejezdí žádná bezplatná linka. Další spoj: pondělí 19. 10. v 5:20 (linka 2)."
- **Street distances**: stop board "nearest bike" and the bike station's nearby stops rank and show walking distance along streets (the page loads its own copy of the street graph).
- **Departures near me**: home lists the next 3 departures from the 2 nearest stops with service (walking minutes, live delays); locates automatically when location is already allowed, otherwise on a tap.
- **Service alerts**: Worker `/alerts` (GTFS-RT alerts.pb, byte-prefiltered, free lines only); app shows active alerts on home, the affected line and trips using it, with the pid.cz link. On 2026-10-17 the feed had 4 alerts, none for the free lines. **Needs a Worker deploy** to go live; until then the app shows no alerts.
- **Accessibility**: every free-line trip is marked low-floor in the PID feed (stated on About). Only 3 free-line platforms have known stop accessibility, all "not accessible" (Pod Lihovarem A, Pacov,u hřbitova A/B); the stop board and trip detail warn about them. No planner filter: 92 of 95 stops are "unknown".
- **Leave-now countdown**: trip detail counts down to when to set off (first bus incl. live delay minus the walk), with an optional 2-minute vibration/notification reminder while the app is open. Hidden for trips without a bus.
- **Refresh street map** workflow (manual) runs `npm run streets` + `npm run data`, commits and deploys.
- Tests: shared 18, pipeline 29, worker 21, app 141; e2e 23 (new: nearby departures, alerts, countdown).

## Lines sharing a road (2026-10-17)
- Lines that run along the same road are drawn side by side (transit-map style) instead of on top of each other: each line's route is sampled every 10 m, lines within 15 m and parallel share the road, slots follow line order 1, 2, 3, 7, 9, 91, 92 and the side is fixed geographically so both directions of a line sit on the same side (`app/src/map/parallel.ts`, 68 ms on load for all lines). Offset and width scale with zoom so neighbouring lines just touch.
- A selected line (line view, map tap) is drawn on top along its true route with a white casing; the others fade to 20 %.

## UI review batch (items 1–13)

- One search entry ("Kam jedete?" in the top bar); the home button is gone.
- Planner collapses to an `A → B · time` summary once both ends are set (tap to edit, "Hotovo" to collapse).
- On-time departures show a green dot instead of "±0 min".
- Every screen opens at its top (BottomSheet resets scroll per route; LineView no longer scrolls on open).
- Dark basemap (OpenFreeMap `dark`) and dark map controls follow `prefers-color-scheme`.
- Locate / layers buttons sit below the zoom control.
- Bus icons scale 0.6 → 1 between zoom 12 and 15 (offsets divided by the scale).
- Back-to-back walks are merged in result cards (`lib/chain.ts`).
- Platform letters are outlined chips (`components/Platform.svelte`).
- Line timetable is a grid of hour cells.
- Emoji UI icons replaced by `components/Icon.svelte` SVGs (users' own saved-place emoji kept).
- Language: auto-detected from the browser on first visit (cs/sk → Czech, else English); switch on the About page.
- Empty "Kam" field offers saved places, recent searches and nearby stops.
