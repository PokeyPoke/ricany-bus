# Stage A verification — 2026-10-15

## Automated
- Unit tests: 93 passed (`npm test`: shared 11, pipeline 17, worker 8, app 57); `npm run typecheck` 0 errors
- Golden RAPTOR vs brute force on real data: passed (part of the app unit tests)
- E2E (Pixel 7 viewport, mocked externals): 10 passed locally and in CI (9 original + a line 1 regression test; the 10-test commit is covered by the CI run below)
- CI: https://github.com/PokeyPoke/ricany-bus/actions/runs/38801079378 (head bdcabb3, 10-test e2e; test + e2e green; earlier run 38800275212 covered the first 9 tests)  ·  Deploy: https://github.com/PokeyPoke/ricany-bus/actions/runs/38800274984

## Live site
- URL: https://pokeypoke.github.io/ricany-bus/ — verified with Playwright (Chromium, 390x844) at ~17:55 Prague time; no browser extension was available, so screenshots replace the walkthrough GIF.
  1. Home: map tiles, colored line shapes, Nextbike dots with counts, 7 line badges. OK.
  2. Plan OÁZA -> Pacov: only free results (Zdarma tags, lines 3 and 2) plus a separate paid "S Nextbike (placené)" section; trip detail shows `±0 min` delay badges. OK.
  3. Stop board (nádraží): "za 9 min" countdowns with live `+1 min` / `+2 min` / `±0 min`. OK.
  4. `#/line/1`: timetable renders. Found and fixed an issue: the default stop (Oáza) has no weekday service, so the page showed "V tento den linka nejede"; it now defaults to a stop with service (17 hour rows after the fix).
  5. EN toggle: switches the UI to English and the toggle becomes "CZ". OK.
  6. Worker `/delays` returns JSON (`{"generatedAt":...,"trips":{...}}`). OK.
  No console errors or page errors during the run.
- Screenshots (not in repo): scratchpad `live/home.png`, `plan.png`, `trip.png`, `stop.png`, `line1.png` (before fix), `line1-fixed.png`, `en.png`.
- Service worker: `sw.js` is served and contains `rb-data`; `manifest.webmanifest` returns 200. True offline behaviour not exercised.

## Timetable cross-check
- Source: official ROPID/DPP jrportal PDF for MHD 3 valid from 14.06.2026, stop "Říčany,Jažlovice" (direction Pacov): https://jrportal.dpp.cz/jrportal3/Down.aspx?f=/DataFTP\JRPortalData/1733/20260614/1733_(1877_11)T.pdf&m=0 (linked from https://pid.cz/zastavkove-jizdni-rady/?cid=1733&from=1781388000&type=smluvni). ricany.cz had no reachable timetable page.
- Line / stop / day type: line 3, Jažlovice (first stop, dir Pacov), weekday (Pracovní den)
- Official (25): 05:32 06:02 06:32 07:02 07:32 08:02 08:32 09:02 10:02 11:02 12:02 12:32 13:02 13:32 14:02 14:32 15:02 15:32 16:02 16:32 17:02 18:02 19:02 20:02 21:02
- App (25): identical list (weekday 2026-10-15)
- First 5 and last 2 compared: 05:32 06:02 06:32 07:02 07:32 ... 20:02 21:02 — match. Whole list matches.
- Result: match. The PDF footer says 28.10.2026 runs as Saturday (a holiday); the controller verified in `timetable.json` that the data gives that date Saturday service (`servicesByDate['20261028'] = ['0000010-1']`, the Saturday service id).

## Definition of done (spec §8)
1. ≤ 3 taps from my location to free-only results: e2e "≤ 3 taps" test (geolocated start asserted in the URL, results shown) and the free-only badge assertions pass.
2. Departure board for every stop; map view + timetable for every line: sampled only. Stop board checked for the busiest stop (nádraží) in e2e and live; line views checked for lines 1 and 3 (e2e + live). Not every stop or line was opened individually; the views are generic over the data.
3. Nextbike live counts; bike trips in a separate paid section: live plan screenshot shows the separate paid section; map shows counts; e2e checks the nearest-bike row and the station page (mocked data).
4. Czech + English; saved places persist; installable PWA; offline timetables: e2e covers language persistence and saved places. PWA is evidenced only by the manifest (200) and a service worker (`sw.js` containing `rb-data`) being present; installability and offline behaviour were not exercised.
5. Nightly refresh with zero manual steps; bad feed never breaks the site: refresh-data.yml run https://github.com/PokeyPoke/ricany-bus/actions/runs/38760118781 (success); validation gate tests.
6. Golden trips match official timetable: the golden RAPTOR-vs-brute-force test on real data (unit tests) plus the line 3 / Jažlovice weekday PDF cross-check above (25/25 departures match).
