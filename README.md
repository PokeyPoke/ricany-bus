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
- `cd worker && npx --yes wrangler@4 deploy` — deploy the Worker

Data: © ROPID / PID open data, © OpenStreetMap contributors, Nextbike.
