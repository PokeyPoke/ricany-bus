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
- Overpass from GitHub Actions (blocked from this container; the OSM API fallback was used to build the committed graph).
