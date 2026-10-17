# Říčany zdarma — free-bus route planner

Mobile web app that plans trips in Říčany using **only** the free MHD Říčany lines
(1, 2, 3, 7, 9, 91, 92), plus walking and optional Nextbike, with live delays.

- Site: https://pokeypoke.github.io/ricany-bus/
- Live-delay proxy: https://ricany-bus-live.pokeypoke.workers.dev/delays
- Spec: `docs/superpowers/specs/2026-10-15-ricany-free-bus-design.md`

## Layout
- `pipeline/` — PID GTFS → `app/public/data/*.json` (nightly GitHub Action)
- `worker/` — Cloudflare Worker trimming PID GTFS-RT to free-line delays
- `app/` — Svelte 5 PWA (GitHub Pages)
- `shared/` — types, constants, geo/time helpers

## Commands
- `npm test` / `npm run typecheck` — all workspaces
- `npm run data` — regenerate timetable data from the live PID feed (nightly in CI; also recomputes walking times between nearby stops from the committed street graph)
- `npm run streets` — rebuild the walking/cycling street graph `app/public/data/streets.json` from OpenStreetMap (Overpass, falling back to the OSM API). Run it by hand every few months and commit the result; it is not part of the nightly job
- `npm run dev -w app` — local dev server
- `npx playwright install chromium` (once), then `npm run e2e -w app` — Playwright e2e on a Pixel 7 viewport with mocked external APIs
- `cd worker && npx --yes wrangler@4 deploy` — deploy the Worker manually. The "Deploy Worker" GitHub workflow (`.github/workflows/worker.yml`) deploys automatically on pushes to `main` that touch `worker/` or `shared/`, but only when the `CLOUDFLARE_API_TOKEN` secret exists (Workers Scripts:Edit on this account); otherwise it skips the deploy with a notice and you deploy manually as above.

## Known limitations
- Offline use after a first visit is covered by a Playwright service-worker e2e test, not yet tried on a real device or installed PWA.
- The Worker byte-filters the PID GTFS-RT feed before decoding; timed locally in Node on real feeds (2026-10-17) at about 1 ms per refresh warm and 6–8 ms cold, against the free plan's 10 ms CPU limit (not measured on Cloudflare itself). The app falls back gracefully ("bez živých dat") when the Worker fails.
- Walking and cycling are routed along OpenStreetMap streets in the browser. Places more than 300 m from any street (or outside the Říčany area) fall back to straight-line × 1.3 estimates. Opposite platforms under 60 m apart keep the straight-line transfer time, as the street data may not show the crossing.
- Live buses glide between position reports, so the drawn bus trails the latest report by up to one report interval (≤ 15 s).

Data: © ROPID / PID open data, © OpenStreetMap contributors, Nextbike.
