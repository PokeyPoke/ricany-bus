# Stage B verification — 2026-10-16

## Automated
- Unit tests: shared 22, pipeline 19, app 112 (worker included in the root `npm test`); all green. `npm run typecheck`: 0 errors.
- E2E (Pixel 7 viewport, mocked externals incl. `/positions`): 21 passed locally (10 Stage A + layers/About/Kam jedete?/combobox + Stage B `e2e/stage-b.spec.ts`: bus tap on map via `window.__rbMap` (enabled only with `?e2e` in production builds), bus sheet by URL, numbered line stops + `aria-current`, stop board "Jet odsud", About + ricany.cz link, share clipboard fallback toast, offline reload with the service worker).
- CI (Node 22, ubuntu-24.04; see `ci.yml`) and Deploy, e2e-hook commit: https://github.com/PokeyPoke/ricany-bus/actions/runs/38943275988 and https://github.com/PokeyPoke/ricany-bus/actions/runs/38943276027. Stage B specs commit: CI https://github.com/PokeyPoke/ricany-bus/actions/runs/38943775835, Deploy https://github.com/PokeyPoke/ricany-bus/actions/runs/38943775888. Runs for the final docs/tidy commit are in the task report.
- The line -> Kam jedete? -> ride e2e comes from Stage A/Task 7 (`app.spec.ts`); `stage-b.spec.ts` does not duplicate it.
- Nightly refresh still green: https://github.com/PokeyPoke/ricany-bus/actions/runs/38867376052

## Live site (https://pokeypoke.github.io/ricany-bus/, Chromium 390x844 @2x, real network, 19:55–19:57 Prague, within service hours)
- Worker `/positions` returned 7 vehicles, `/delays` 200; no `X-Stale` header on either.
- Timing: first bus feature in the map source 1.7 s after page load (measured live at 20:02 via `__rbMap`, one run, warm connection).
- Buses visible in line colours with direction arrows (7 vehicles, fanned out where overlapping). Tapping the line 7 bus opened `#/bus/1736_90_260413`: badge 7 -> Olivovna, upcoming stops with times, ring markers on the map.
- `#/line/3`: 18 `line-stops` features, numbered markers on the map, numbered list.
- Line 3 stop -> "Kam jedete?" -> downstream stop -> `#/ride?line=3&dir=0&…`: 6 departure rows.
- About page: "Neoficiální aplikace" and a ricany.cz link; EN toggle switches to English.
- No page or console errors.
- Screenshots (scratch, not in repo): `scratchpad/live/home-buses.png`, `bus-sheet.png`, `line3.png`, `from.png`, `ride.png`, `about-en.png`.

## Definition of done (spec §10)
1. Buses on the map within 30 s, tap shows next stops: first bus feature appeared 1.7 s after load live (single measurement); tap -> next stops verified live and by e2e with a mocked vehicle.
2. Ring markers per stop group, names from zoom 14, numbered line stops linked to the list: ring markers seen live; stop names visible at zoom 14 live (`scratchpad/live/z14.png`: U Trati, Březinova, Pod Lihovarem, Sofie...). Numbered markers are verified live only (screenshot line3.png); e2e proves only that `line-stops` source features exist. Tap linking asserted by e2e (`aria-current`). Desktop hover not exercised in a browser.
3. From a stop, <= 2 taps to direct departures: line view -> Kam jedete? -> downstream stop -> ride list verified live and in e2e.
4. Worker: pre-filtered decoding, stale-on-error and `/positions` are covered by worker unit tests and live (positions OK, no X-Stale). GitHub worker deploy is skipped when `CLOUDFLARE_API_TOKEN` is unset (documented in `worker.yml`; the worker was deployed manually) — no `worker.yml` run exists yet, so the GitHub path is unverified.
5. About, share, a11y, map fallback, offline: About live + e2e; share fallback toast e2e; offline-after-first-visit e2e (service worker, offline reload of the plan URL). Map fallback style: unit/e2e fixture only, not triggered live.
6. CI on Node 22: yes. Nightly refresh green. OG: `og:image` meta present on the live page and `og.png` returns 200 (also `app/test/meta.test.ts`); rendering in a link previewer not checked.
7. All tests green; deployed site verified at phone size: yes.

## Not verified
- Worker CPU/limits under peak load; behaviour after service hours (checked only during service).
- Offline on a real device / installed PWA; only the Playwright service-worker simulation.
- Stale/stale-on-error path against the real upstream (unit tests only).
