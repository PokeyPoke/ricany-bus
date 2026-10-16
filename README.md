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
- `npm run data` — regenerate timetable data from the live PID feed
- `npm run dev -w app` — local dev server
- `npx playwright install chromium` (once), then `npm run e2e -w app` — Playwright e2e on a Pixel 7 viewport with mocked external APIs
- `cd worker && npx --yes wrangler@4 deploy` — deploy the Worker manually. The "Deploy Worker" GitHub workflow (`.github/workflows/worker.yml`) deploys automatically on pushes to `main` that touch `worker/` or `shared/`, but only when the `CLOUDFLARE_API_TOKEN` secret exists (Workers Scripts:Edit on this account); otherwise it skips the deploy with a notice and you deploy manually as above.

## Known limitations
- Offline use is configured (PWA service worker) but not exercised by the e2e tests.
- The Worker decodes the full PID GTFS-RT feed every 15 s; on the Cloudflare free plan this may hit the CPU limit. The app falls back gracefully ("bez živých dat") when the Worker fails.
- Walking and cycling times are straight-line (haversine × 1.3) estimates, not routed along streets.

Data: © ROPID / PID open data, © OpenStreetMap contributors, Nextbike.
