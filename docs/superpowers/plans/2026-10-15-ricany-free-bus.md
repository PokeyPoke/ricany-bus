# Říčany Free Bus Router — Implementation Plan (Stage A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first PWA that plans trips in Říčany using only the free MHD Říčany lines (plus walking and optional Nextbike), with live delays, stop departure boards, line timetables, saved places, Czech/English — hosted for €0 and refreshed nightly with no human involvement.

**Architecture:** npm-workspaces monorepo. `pipeline/` converts the PID GTFS feed into small JSON files committed into `app/public/data/` by a nightly GitHub Action. `app/` is a static Svelte 5 + Vite PWA on GitHub Pages; routing (RAPTOR) runs in a Web Worker on the phone. `worker/` is a Cloudflare Worker that trims PID's 3.5 MB GTFS-RT feed to a few KB of free-line delays. `shared/` holds data-format types, constants, and geo/time helpers used by all three.

**Tech Stack:** TypeScript (strict), Node 20+, Vitest, csv-parse, Svelte 5, Vite, vite-plugin-pwa, MapLibre GL, OpenFreeMap tiles, Photon geocoder, Cloudflare Workers (wrangler), Playwright, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-15-ricany-free-bus-design.md` — read it before starting any task.

## Autonomy rules (the human is NOT available)

The owner has pre-authorized, for this project only: creating the **public** repo `PokeyPoke/ricany-bus`, pushing directly to `main`, enabling GitHub Pages, and deploying the Cloudflare Worker from this Mac with the existing wrangler OAuth login. Do not ask for confirmation for those. Do not do anything else outward-facing (no other repos, no other Cloudflare resources, no emails, no paid services).

- `gh` CLI is logged in as **PokeyPoke** (scopes `repo`, `workflow`).
- Wrangler is logged in (see `npx --yes wrangler@4 whoami` for the account). The `workers.dev` subdomain **`pokeypoke`** is already registered, so the Worker URL will be `https://ricany-bus-live.pokeypoke.workers.dev`.
- Always invoke wrangler as `npx --yes wrangler@4 …` (it is not installed globally).
- Site URL: `https://pokeypoke.github.io/ricany-bus/` (Vite `base: '/ricany-bus/'`).
- If a tool fails mysteriously, check `~/code/papercuts.md` first; when you lose time to something, append a line `date • symptom • fix • ricany-bus` to it.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (preceded by a blank line).
- If a step's expected output does not match, debug (superpowers:systematic-debugging) — never weaken a test to make it pass.

## Global Constraints

- Free lines are selected **only by route_id** `L1731 L1732 L1733 L1734 L1735 L1736 L1737`; never by `route_short_name` (Benešov L1761– and Kolín L1781– also use "MHD 1"…).
- Display numbers: L1731→1, L1732→2, L1733→3, L1736→7, L1737→9, L1734→91, L1735→92.
- Walking: haversine × 1.3 at 4.5 km/h. Access/egress ≤ 1200 m. Transfers ≤ 400 m. Same-stop transfer ≥ 60 s.
- Bike: haversine × 1.3 at 14 km/h, +60 s rent, +60 s return. Max one bike leg. Pickup needs `bikes > 0` now.
- Max 3 bus rides per itinerary. Up to 4 free results. Walk-only shown if ≤ 30 min.
- Mixed bike results only if ≥ 5 min better than best free result; always labeled paid.
- Transfer-risk warning when live delays make a transfer margin < 60 s.
- Data sources: `https://data.pid.cz/PID_GTFS.zip`; `https://api.golemio.cz/v2/vehiclepositions/gtfsrt/trip_updates.pb`; `https://api.nextbike.net/maps/nextbike-live.json?city=736`; tiles `https://tiles.openfreemap.org/styles/liberty`; geocoder `https://photon.komoot.io/api/`. Nominatim is **not** used.
- Czech is the default language; English optional and persisted. Stop names are never translated. The `Říčany,` prefix is stripped from displayed stop names.
- Times are seconds after service-day midnight, Europe/Prague. Dates are `YYYYMMDD` strings.
- `localStorage` access is always wrapped in try/catch.
- Every push runs typecheck + tests; deploys are gated on them.
- Lines do not run on Sundays; timetable window ≈ 14 days.

## Review Focus

1. **Evening / Sunday "depart now"** — no more buses today must roll over to the next service day(s) with a visible date, not "no route". Test: Task 6 `rolls over to the next day`.
2. **Origin and destination very close** (same street) — expect walk-only, not a bus that arrives later than walking. Test: Task 6 `drops bus trips slower than walking`.
3. **Origin/destination outside 1.2 km of any free stop** — expect a clear "no stop nearby" message with bike/walk options, not a blank list. Test: Task 6 `reports no nearby stops`; UI message in Task 14.
4. **Nextbike stations in maintenance / inactive / free-floating bikes** — must not be offered as pickup points. Test: Task 11 `parseNextbike filters unusable places`.
5. **Live delay for the same trip_id on a different service date** (yesterday's run) — must not be applied. Test: Task 8 `ignores delays from a different start date`.

## File Structure

```
ricany-bus/
├── package.json                 workspaces + root scripts
├── tsconfig.base.json
├── .github/workflows/
│   ├── ci.yml                   typecheck + unit tests + e2e on push/PR
│   ├── deploy.yml               build app + deploy Pages (push main, dispatch, workflow_call)
│   └── refresh-data.yml         nightly pipeline → commit data → call deploy
├── shared/src/
│   ├── index.ts                 re-exports
│   ├── constants.ts             FREE_ROUTE_IDS, LINE_STYLE, model constants, bbox
│   ├── types.ts                 data-file formats + DelaysResponse
│   ├── geo.ts                   haversine, walkSec, bikeSec
│   ├── dates.ts                 addDays, weekday, daysBetween
│   └── time.ts                  pragueNow, pragueToUtc, formatHM, hmToSec, secToHM
├── pipeline/src/
│   ├── source.ts                streaming CSV rows from a zip or a directory
│   ├── extract.ts               filter GTFS to free lines → RawFree
│   ├── build.ts                 RawFree → stops/lines/timetable/meta JSON
│   ├── validate.ts              validation gate
│   └── cli.ts                   download → extract → build → validate → write
├── pipeline/test/fixture/*.txt  tiny GTFS
├── worker/src/
│   ├── pb.ts                    minimal GTFS-RT protobuf decoder
│   ├── filter.ts                keep free-line trip updates
│   └── index.ts                 /delays handler with 15 s memo
├── worker/scripts/make-fixture.mjs
├── app/
│   ├── index.html, vite.config.ts, svelte.config.js, playwright.config.ts
│   ├── public/data/*.json       generated by pipeline (committed)
│   ├── public/icons/*           PWA icons
│   ├── src/main.ts, App.svelte, app.css, config.ts
│   ├── src/router/              types, network, raptor, plan, bike, delays, departures, timetable, worker, client
│   ├── src/lib/                 storage, i18n, hashRoute, nav, data, network, ui, live, geocode, geoloc, places
│   ├── src/map/                 MapView.svelte, layers.ts, geojson.ts
│   ├── src/components/          BottomSheet, LineBadge, PlaceInput, AddPlace, ItineraryCard, DelayBadge
│   ├── src/sheets/              Home, Planner, TripDetail, StopBoard, LineView, BikeStation
│   ├── test/                    vitest unit tests (+ golden.test.ts on real data)
│   └── e2e/                     Playwright specs + fixtures
└── docs/
```

---

### Task 1: Monorepo bootstrap, shared package, CI, GitHub repo

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.github/workflows/ci.yml`, `README.md`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/{index,constants,types,geo,dates,time}.ts`
- Test: `shared/test/{geo,dates,time}.test.ts`
- Modify: `.gitignore` (already exists: `.remember/ node_modules/ dist/ .DS_Store .wrangler/`)

**Interfaces:**
- Produces (import from `@rb/shared`): `FREE_ROUTE_IDS`, `FreeRouteId`, `LINE_STYLE`, `NEXTBIKE_CITY_UID`, `RIC_CENTER`, `RIC_BBOX`, `WALK_SPEED_MPS`, `BIKE_SPEED_MPS`, `DETOUR`, `MAX_ACCESS_WALK_M`, `MAX_TRANSFER_WALK_M`, `MIN_TRANSFER_SEC`, `BIKE_RENT_SEC`, `BIKE_RETURN_SEC`, `MAX_RIDES`; types `StopRec`, `StopsFile`, `LineDirection`, `LineRec`, `LinesFile`, `TripRec`, `PatternRec`, `TimetableFile`, `MetaFile`, `DelaysResponse`, `TripDelay`; functions `haversine(lat1,lon1,lat2,lon2): number` (m), `walkSec(m): number`, `bikeSec(m): number`, `addDays(d: string, n: number): string`, `weekday(d: string): number` (0=Mon…6=Sun), `daysBetween(a: string, b: string): number`, `pragueNow(at?: Date): { date: string; sec: number }`, `pragueToUtc(date: string, sec: number): Date`, `formatHM(sec: number): string`, `hmToSec(hm: string): number`, `secToHM(sec: number): string`.

- [ ] **Step 1: Root workspace files**

`package.json`:
```json
{
  "name": "ricany-bus",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "pipeline", "worker", "app"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "data": "npm run data -w pipeline"
  },
  "engines": { "node": ">=20" }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": []
  }
}
```

`shared/package.json`:
```json
{
  "name": "@rb/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc -p tsconfig.json" },
  "devDependencies": {}
}
```

`shared/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

Run: `npm i -D -w shared vitest typescript` then `npm i` at the root.
Expected: `node_modules/@rb/shared` symlink exists (`ls -l node_modules/@rb`).

- [ ] **Step 2: Write failing shared tests**

`shared/test/geo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { haversine, walkSec, bikeSec } from '../src/index';

describe('geo', () => {
  it('haversine ~ 556 m per 0.005° latitude', () => {
    expect(haversine(49.99, 14.65, 49.995, 14.65)).toBeGreaterThan(550);
    expect(haversine(49.99, 14.65, 49.995, 14.65)).toBeLessThan(560);
  });
  it('walkSec applies 1.3 detour at 4.5 km/h', () => {
    expect(walkSec(1000)).toBe(Math.round((1000 * 1.3) / (4.5 / 3.6))); // 1040
  });
  it('bikeSec applies 1.3 detour at 14 km/h', () => {
    expect(bikeSec(1000)).toBe(Math.round((1000 * 1.3) / (14 / 3.6))); // 334
  });
});
```

`shared/test/dates.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { addDays, weekday, daysBetween } from '../src/index';

describe('dates', () => {
  it('addDays crosses month ends', () => {
    expect(addDays('20261031', 1)).toBe('20261101');
    expect(addDays('20261101', -1)).toBe('20261031');
  });
  it('weekday is 0=Monday', () => {
    expect(weekday('20261019')).toBe(0);
    expect(weekday('20261018')).toBe(6);
  });
  it('daysBetween', () => {
    expect(daysBetween('20261015', '20261028')).toBe(13);
    expect(daysBetween('20261028', '20261015')).toBe(-13);
  });
});
```

`shared/test/time.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pragueNow, pragueToUtc, formatHM, hmToSec, secToHM } from '../src/index';

describe('time', () => {
  it('pragueNow in summer time (UTC+2)', () => {
    expect(pragueNow(new Date('2026-10-15T12:00:00Z'))).toEqual({ date: '20261015', sec: 14 * 3600 });
  });
  it('pragueNow in winter time (UTC+1)', () => {
    expect(pragueNow(new Date('2026-12-01T23:30:00Z'))).toEqual({ date: '20261202', sec: 30 * 60 });
  });
  it('pragueToUtc inverts pragueNow', () => {
    expect(pragueToUtc('20261015', 7 * 3600 + 30 * 60).toISOString()).toBe('2026-10-15T05:30:00.000Z');
    expect(pragueToUtc('20261202', 1800).toISOString()).toBe('2026-12-01T23:30:00.000Z');
  });
  it('formatHM wraps past midnight', () => {
    expect(formatHM(8 * 3600 + 30 * 60)).toBe('8:30');
    expect(formatHM(86400 + 600)).toBe('0:10');
    expect(formatHM(9 * 3600 + 5 * 60 + 59)).toBe('9:05');
  });
  it('hmToSec / secToHM', () => {
    expect(hmToSec('08:05')).toBe(29100);
    expect(secToHM(29100)).toBe('08:05');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -w shared`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 4: Implement shared sources**

`shared/src/constants.ts`:
```ts
export const FREE_ROUTE_IDS = ['L1731', 'L1732', 'L1733', 'L1734', 'L1735', 'L1736', 'L1737'] as const;
export type FreeRouteId = (typeof FREE_ROUTE_IDS)[number];

/** Display order follows FREE_ROUTE_IDS order sorted by number: 1,2,3,7,9,91,92. */
export const LINE_STYLE: Record<FreeRouteId, { number: string; color: string; text: string }> = {
  L1731: { number: '1', color: '#E4002B', text: '#FFFFFF' },
  L1732: { number: '2', color: '#0072CE', text: '#FFFFFF' },
  L1733: { number: '3', color: '#00965E', text: '#FFFFFF' },
  L1736: { number: '7', color: '#F2A900', text: '#000000' },
  L1737: { number: '9', color: '#7A3E9D', text: '#FFFFFF' },
  L1734: { number: '91', color: '#4A5560', text: '#FFFFFF' },
  L1735: { number: '92', color: '#A05A2C', text: '#FFFFFF' },
};
export const LINE_ORDER: FreeRouteId[] = ['L1731', 'L1732', 'L1733', 'L1736', 'L1737', 'L1734', 'L1735'];

export const NEXTBIKE_CITY_UID = 736;
export const RIC_CENTER = { lat: 49.9918, lon: 14.6556 };
/** minLon, minLat, maxLon, maxLat */
export const RIC_BBOX = [14.58, 49.95, 14.74, 50.03] as const;

export const WALK_SPEED_MPS = 4.5 / 3.6;
export const BIKE_SPEED_MPS = 14 / 3.6;
export const DETOUR = 1.3;
export const MAX_ACCESS_WALK_M = 1200;
export const MAX_TRANSFER_WALK_M = 400;
export const MIN_TRANSFER_SEC = 60;
export const BIKE_RENT_SEC = 60;
export const BIKE_RETURN_SEC = 60;
export const MAX_RIDES = 3;
```

`shared/src/types.ts`:
```ts
import type { FreeRouteId } from './constants';

export interface StopRec {
  id: string;
  name: string; // "Masarykovo nám." (prefix "Říčany," stripped)
  platform: string;
  lat: number;
  lon: number;
  lines: FreeRouteId[];
  /** [target stop index, walking seconds] for stops ≤ 400 m away */
  transfers: [number, number][];
}
export interface StopsFile { stops: StopRec[] }

export interface LineDirection {
  directionId: number;
  headsign: string;
  stops: number[];
  /** [lon, lat] */
  shape: [number, number][];
}
export interface LineRec {
  routeId: FreeRouteId;
  number: string;
  color: string;
  text: string;
  longName: string;
  directions: LineDirection[];
}
export interface LinesFile { lines: LineRec[] }

export interface TripRec {
  id: string;
  service: string;
  /** seconds after service-day midnight, one per pattern stop */
  arr: number[];
  dep: number[];
}
export interface PatternRec {
  routeId: FreeRouteId;
  directionId: number;
  headsign: string;
  stops: number[];
  /** GTFS stop_sequence per pattern position (needed to match GTFS-RT updates) */
  seq: number[];
  /** sorted by dep[0] */
  trips: TripRec[];
}
export interface TimetableFile {
  patterns: PatternRec[];
  /** YYYYMMDD → active service_ids */
  servicesByDate: Record<string, string[]>;
}
export interface MetaFile {
  feedStart: string;
  feedEnd: string;
  generatedAt: string;
  tripCount: number;
}

export interface TripDelay {
  startDate: string;
  /** trip-level fallback delay in seconds */
  delay: number;
  /** stop_sequence → departure (or arrival) delay in seconds */
  stops: Record<number, number>;
}
export interface DelaysResponse {
  /** feed header timestamp, unix seconds */
  generatedAt: number;
  trips: Record<string, TripDelay>;
}
```

`shared/src/geo.ts`:
```ts
import { DETOUR, WALK_SPEED_MPS, BIKE_SPEED_MPS } from './constants';

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const walkSec = (m: number) => Math.round((m * DETOUR) / WALK_SPEED_MPS);
export const bikeSec = (m: number) => Math.round((m * DETOUR) / BIKE_SPEED_MPS);
```

`shared/src/dates.ts`:
```ts
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
const fromUtc = (ms: number) => {
  const x = new Date(ms);
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
};
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86400000);
/** 0 = Monday … 6 = Sunday */
export const weekday = (d: string) => (new Date(toUtc(d)).getUTCDay() + 6) % 7;
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
```

`shared/src/time.ts`:
```ts
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function pragueNow(at: Date = new Date()): { date: string; sec: number } {
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}${p.month}${p.day}`, sec: +p.hour * 3600 + +p.minute * 60 + +p.second };
}

/** Wall-clock (date, seconds) in Prague → UTC instant. */
export function pragueToUtc(date: string, sec: number): Date {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)) + sec * 1000;
  let t = guess - 3600 * 1000; // Prague is UTC+1 or UTC+2
  for (let i = 0; i < 3; i++) {
    const n = pragueNow(new Date(t));
    const shownMs = Date.UTC(+n.date.slice(0, 4), +n.date.slice(4, 6) - 1, +n.date.slice(6, 8)) + n.sec * 1000;
    t += guess - shownMs;
  }
  return new Date(t);
}

export function formatHM(sec: number): string {
  const s = ((Math.floor(sec / 60) * 60) % 86400 + 86400) % 86400;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}
export const hmToSec = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 3600 + m * 60;
};
export const secToHM = (sec: number) => {
  const s = ((sec % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
};
```

`shared/src/index.ts`:
```ts
export * from './constants';
export * from './types';
export * from './geo';
export * from './dates';
export * from './time';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: all tests PASS, tsc no output.

- [ ] **Step 6: CI workflow and README**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

`README.md`:
```markdown
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
- `cd worker && npx --yes wrangler@4 deploy` — deploy the Worker

Data: © ROPID / PID open data, © OpenStreetMap contributors, Nextbike.
```

- [ ] **Step 7: Create GitHub repo, commit, push**

```bash
git add -A
git commit -m "chore: monorepo bootstrap with shared package and CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh repo create PokeyPoke/ricany-bus --public --source . --remote origin --push \
  --description "Route planner for the free MHD Říčany buses + Nextbike"
```
Expected: repo URL printed; `gh run list --limit 1` shows CI queued/in progress. Wait for it: `gh run watch --exit-status $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')` → success.

---

### Task 2: Pipeline — streaming GTFS source and free-line extraction

**Files:**
- Create: `pipeline/package.json`, `pipeline/tsconfig.json`, `pipeline/src/source.ts`, `pipeline/src/extract.ts`
- Create fixture: `pipeline/test/fixture/{routes,trips,stop_times,stops,calendar,calendar_dates,shapes,feed_info}.txt`
- Test: `pipeline/test/extract.test.ts`

**Interfaces:**
- Consumes: `FREE_ROUTE_IDS`, `FreeRouteId` from `@rb/shared`.
- Produces: `type Row = Record<string,string>`; `interface GtfsSource { rows(file: string): AsyncIterable<Row> }`; `dirSource(dir: string): GtfsSource`; `zipSource(zipPath: string): GtfsSource`; `parseTime(t: string): number`; `extractFree(src: GtfsSource): Promise<RawFree>` with
  ```ts
  interface RawStopTime { seq: number; stopId: string; arr: number; dep: number }
  interface RawTrip { id: string; routeId: FreeRouteId; serviceId: string; directionId: number; headsign: string; shapeId: string; stopTimes: RawStopTime[] }
  interface RawFree {
    routes: Map<FreeRouteId, { longName: string }>;
    trips: RawTrip[];
    stops: Map<string, { name: string; platform: string; lat: number; lon: number }>;
    calendar: Row[]; calendarDates: Row[];
    shapes: Map<string, [number, number][]>; // [lon, lat]
    feedInfo: { start: string; end: string };
  }
  ```

- [ ] **Step 1: Package setup**

`pipeline/package.json`:
```json
{
  "name": "@rb/pipeline",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "data": "tsx src/cli.ts"
  },
  "dependencies": { "@rb/shared": "*" }
}
```
`pipeline/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src", "test"] }
```
Run: `npm i -w pipeline csv-parse && npm i -D -w pipeline vitest typescript tsx @types/node`

- [ ] **Step 2: Fixture GTFS**

`pipeline/test/fixture/routes.txt`:
```
route_id,agency_id,route_short_name,route_long_name,route_type,route_url,route_color,route_text_color,is_night,is_regional,is_substitute_transport
L1731,99,MHD 1,"Oáza/Kuří - Strašín",3,,007DA8,FFFFFF,0,0,0
L1733,99,MHD 3,"Jažlovice - Pacov",3,,007DA8,FFFFFF,0,0,0
L1761,99,MHD 1,"MHD Benešov ORANŽOVÁ Albert - Terminál",3,,007DA8,FFFFFF,0,0,0
L364,99,364,"Praha,Depo Hostivař - Doubek",3,,007DA8,FFFFFF,0,1,0
```
`pipeline/test/fixture/trips.txt`:
```
route_id,service_id,trip_id,trip_headsign,direction_id,shape_id
L1731,W,1731_1,"Říčany,Gamma",0,L1731V1
L1731,W,1731_2,"Říčany,Alfa",1,L1731V2
L1731,S,1731_3,"Říčany,Gamma",0,L1731V1
L1733,W,1733_1,"Říčany,Epsilon",0,L1733V1
L1761,W,1761_1,"Benešov,X",0,L1761V1
L364,W,364_1,"Doubek",0,L364V1
```
`pipeline/test/fixture/stop_times.txt`:
```
trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type
1731_1,07:00:00,07:00:00,UA,1,3,3
1731_1,07:05:00,07:05:30,UB,2,3,3
1731_1,07:10:00,07:10:00,UC,3,3,3
1731_2,08:00:00,08:00:00,UC,1,3,3
1731_2,08:05:00,08:05:00,UB,2,3,3
1731_2,08:10:00,08:10:00,UA,3,3,3
1731_3,09:00:00,09:00:00,UA,1,3,3
1731_3,09:05:00,09:05:30,UB,2,3,3
1731_3,09:10:00,09:10:00,UC,3,3,3
1733_1,07:20:00,07:20:00,UD,1,3,3
1733_1,07:30:00,07:30:00,UE,2,3,3
1761_1,07:00:00,07:00:00,UX,1,0,0
1761_1,07:20:00,07:20:00,UY,2,0,0
364_1,07:00:00,07:00:00,UA,1,0,0
364_1,07:30:00,07:30:00,UX,2,0,0
```
`pipeline/test/fixture/stops.txt`:
```
stop_id,stop_name,stop_lat,stop_lon,zone_id,stop_url,location_type,parent_station,wheelchair_boarding,level_id,platform_code
UA,"Říčany,Alfa",49.990000,14.650000,1,,0,,0,,A
UB,"Říčany,Beta",49.995000,14.655000,1,,0,,0,,A
UC,"Říčany,Gamma",50.000000,14.660000,1,,0,,0,,A
UD,"Říčany,Delta",50.001500,14.661000,1,,0,,0,,B
UE,"Říčany,Epsilon",50.005000,14.670000,1,,0,,0,,A
UX,"Benešov,X",49.780000,14.680000,1,,0,,0,,
UY,"Benešov,Y",49.790000,14.690000,1,,0,,0,,
```
`pipeline/test/fixture/calendar.txt`:
```
service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
W,1,1,1,1,1,0,0,20261012,20261030
S,0,0,0,0,0,1,0,20261012,20261030
```
`pipeline/test/fixture/calendar_dates.txt`:
```
service_id,date,exception_type
W,20261028,2
S,20261028,1
```
`pipeline/test/fixture/shapes.txt`:
```
shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence,shape_dist_traveled
L1731V1,50.000000,14.660000,3,1.32
L1731V1,49.990000,14.650000,1,0
L1731V1,49.995000,14.655000,2,0.66
L1761V1,49.780000,14.680000,1,0
```
`pipeline/test/fixture/feed_info.txt`:
```
feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_contact_email
"ROPID","https://pid.cz",cs,20261015,20261028,"opendata@pid.cz"
```
(Shape rows are deliberately out of order; shapes L1731V2/L1733V1 are deliberately missing.)

- [ ] **Step 3: Write failing test**

`pipeline/test/extract.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirSource } from '../src/source';
import { extractFree, parseTime } from '../src/extract';

const FIX = fileURLToPath(new URL('./fixture', import.meta.url));

describe('parseTime', () => {
  it('handles >24h GTFS times', () => {
    expect(parseTime('07:05:30')).toBe(25530);
    expect(parseTime('24:10:00')).toBe(87000);
  });
});

describe('extractFree', () => {
  it('keeps only free route_ids (not Benešov "MHD 1", not 364)', async () => {
    const raw = await extractFree(dirSource(FIX));
    expect([...raw.routes.keys()].sort()).toEqual(['L1731', 'L1733']);
    expect(raw.trips.map((t) => t.id).sort()).toEqual(['1731_1', '1731_2', '1731_3', '1733_1']);
  });
  it('keeps only stops served by free trips', async () => {
    const raw = await extractFree(dirSource(FIX));
    expect([...raw.stops.keys()].sort()).toEqual(['UA', 'UB', 'UC', 'UD', 'UE']);
    expect(raw.stops.get('UA')).toEqual({ name: 'Říčany,Alfa', platform: 'A', lat: 49.99, lon: 14.65 });
  });
  it('orders stop times and parses arr/dep', async () => {
    const raw = await extractFree(dirSource(FIX));
    const t = raw.trips.find((x) => x.id === '1731_1')!;
    expect(t.stopTimes.map((s) => s.stopId)).toEqual(['UA', 'UB', 'UC']);
    expect(t.stopTimes[1]).toEqual({ seq: 2, stopId: 'UB', arr: 25500, dep: 25530 });
  });
  it('keeps calendar rows and shapes only for free services, shapes sorted', async () => {
    const raw = await extractFree(dirSource(FIX));
    expect(raw.calendar.map((c) => c.service_id).sort()).toEqual(['S', 'W']);
    expect(raw.calendarDates.length).toBe(2);
    expect(raw.shapes.get('L1731V1')).toEqual([[14.65, 49.99], [14.655, 49.995], [14.66, 50]]);
    expect(raw.shapes.has('L1761V1')).toBe(false);
    expect(raw.feedInfo).toEqual({ start: '20261015', end: '20261028' });
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -w pipeline`
Expected: FAIL — cannot find `../src/source`.

- [ ] **Step 5: Implement**

`pipeline/src/source.ts`:
```ts
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse';

export type Row = Record<string, string>;
export interface GtfsSource { rows(file: string): AsyncIterable<Row> }

const parser = () => parse({ columns: true, bom: true, relax_quotes: true, skip_empty_lines: true });

async function* empty(): AsyncIterable<Row> {}

export function dirSource(dir: string): GtfsSource {
  return {
    rows(file) {
      const p = join(dir, file);
      if (!existsSync(p)) return empty();
      return createReadStream(p).pipe(parser());
    },
  };
}

/** Streams one member of a zip with the system `unzip` (present on macOS and ubuntu runners). */
export function zipSource(zipPath: string): GtfsSource {
  return {
    rows(file) {
      const child = spawn('unzip', ['-p', zipPath, file]);
      return child.stdout.pipe(parser());
    },
  };
}
```

`pipeline/src/extract.ts`:
```ts
import { FREE_ROUTE_IDS, type FreeRouteId } from '@rb/shared';
import type { GtfsSource, Row } from './source';

export interface RawStopTime { seq: number; stopId: string; arr: number; dep: number }
export interface RawTrip {
  id: string; routeId: FreeRouteId; serviceId: string; directionId: number;
  headsign: string; shapeId: string; stopTimes: RawStopTime[];
}
export interface RawFree {
  routes: Map<FreeRouteId, { longName: string }>;
  trips: RawTrip[];
  stops: Map<string, { name: string; platform: string; lat: number; lon: number }>;
  calendar: Row[];
  calendarDates: Row[];
  shapes: Map<string, [number, number][]>;
  feedInfo: { start: string; end: string };
}

export function parseTime(t: string): number {
  const [h, m, s] = t.trim().split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

export async function extractFree(src: GtfsSource): Promise<RawFree> {
  const free = new Set<string>(FREE_ROUTE_IDS);

  const routes = new Map<FreeRouteId, { longName: string }>();
  for await (const r of src.rows('routes.txt')) {
    if (free.has(r.route_id)) routes.set(r.route_id as FreeRouteId, { longName: r.route_long_name });
  }

  const trips = new Map<string, RawTrip>();
  for await (const r of src.rows('trips.txt')) {
    if (!free.has(r.route_id)) continue;
    trips.set(r.trip_id, {
      id: r.trip_id, routeId: r.route_id as FreeRouteId, serviceId: r.service_id,
      directionId: Number(r.direction_id || 0), headsign: r.trip_headsign ?? '',
      shapeId: r.shape_id ?? '', stopTimes: [],
    });
  }

  const stopIds = new Set<string>();
  for await (const r of src.rows('stop_times.txt')) {
    const t = trips.get(r.trip_id);
    if (!t) continue;
    t.stopTimes.push({
      seq: Number(r.stop_sequence), stopId: r.stop_id,
      arr: parseTime(r.arrival_time || r.departure_time),
      dep: parseTime(r.departure_time || r.arrival_time),
    });
    stopIds.add(r.stop_id);
  }
  for (const t of trips.values()) t.stopTimes.sort((a, b) => a.seq - b.seq);

  const stops = new Map<string, { name: string; platform: string; lat: number; lon: number }>();
  for await (const r of src.rows('stops.txt')) {
    if (stopIds.has(r.stop_id)) {
      stops.set(r.stop_id, { name: r.stop_name, platform: r.platform_code ?? '', lat: Number(r.stop_lat), lon: Number(r.stop_lon) });
    }
  }

  const services = new Set([...trips.values()].map((t) => t.serviceId));
  const calendar: Row[] = [];
  for await (const r of src.rows('calendar.txt')) if (services.has(r.service_id)) calendar.push(r);
  const calendarDates: Row[] = [];
  for await (const r of src.rows('calendar_dates.txt')) if (services.has(r.service_id)) calendarDates.push(r);

  const shapeIds = new Set([...trips.values()].map((t) => t.shapeId).filter(Boolean));
  const pts = new Map<string, [number, number, number][]>();
  for await (const r of src.rows('shapes.txt')) {
    if (!shapeIds.has(r.shape_id)) continue;
    let a = pts.get(r.shape_id);
    if (!a) pts.set(r.shape_id, (a = []));
    a.push([Number(r.shape_pt_sequence), Number(r.shape_pt_lon), Number(r.shape_pt_lat)]);
  }
  const shapes = new Map<string, [number, number][]>();
  for (const [id, a] of pts) shapes.set(id, a.sort((x, y) => x[0] - y[0]).map((p) => [p[1], p[2]]));

  let feedInfo = { start: '', end: '' };
  for await (const r of src.rows('feed_info.txt')) feedInfo = { start: r.feed_start_date, end: r.feed_end_date };

  return {
    routes,
    trips: [...trips.values()].filter((t) => t.stopTimes.length >= 2),
    stops, calendar, calendarDates, shapes, feedInfo,
  };
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -w pipeline && npm run typecheck -w pipeline`
Expected: 5 tests PASS.

- [ ] **Step 7: Commit and push**

```bash
git add -A && git commit -m "feat(pipeline): stream GTFS and extract free Říčany lines by route_id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 3: Pipeline — build JSON, validation gate, CLI, first real data

**Files:**
- Create: `pipeline/src/build.ts`, `pipeline/src/validate.ts`, `pipeline/src/cli.ts`
- Test: `pipeline/test/build.test.ts`, `pipeline/test/validate.test.ts`
- Generated + committed: `app/public/data/{stops,lines,timetable,meta}.json`

**Interfaces:**
- Consumes: `RawFree`, `Row`, `extractFree`, `zipSource` (Task 2); shared constants/types/geo/dates/time (Task 1).
- Produces: `activeServices(calendar: Row[], calendarDates: Row[], date: string): Set<string>`; `buildData(raw: RawFree, today: string, generatedAt: string): BuiltData` where `interface BuiltData { stops: StopsFile; lines: LinesFile; timetable: TimetableFile; meta: MetaFile }`; `validate(data: BuiltData, today: string, opts?: { requiredRoutes?: readonly string[]; minTrips?: number; maxTrips?: number; minDaysLeft?: number }): string[]`; CLI `npm run data [-- path/to/PID_GTFS.zip]` writes the 4 JSON files to `app/public/data/` only if validation passes, exits 1 otherwise.

- [ ] **Step 1: Write failing tests**

`pipeline/test/build.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirSource } from '../src/source';
import { extractFree, type RawFree } from '../src/extract';
import { buildData, activeServices, type BuiltData } from '../src/build';

const FIX = fileURLToPath(new URL('./fixture', import.meta.url));
let raw: RawFree;
let data: BuiltData;
beforeAll(async () => {
  raw = await extractFree(dirSource(FIX));
  data = buildData(raw, '20261015', '2026-10-15T04:30:00Z');
});
const idx = (id: string) => data.stops.stops.findIndex((s) => s.id === id);

describe('activeServices', () => {
  it('weekday, saturday, and calendar_dates exceptions', () => {
    expect([...activeServices(raw.calendar, raw.calendarDates, '20261019')]).toEqual(['W']);
    expect([...activeServices(raw.calendar, raw.calendarDates, '20261017')]).toEqual(['S']);
    expect([...activeServices(raw.calendar, raw.calendarDates, '20261028')]).toEqual(['S']);
    expect([...activeServices(raw.calendar, raw.calendarDates, '20261018')]).toEqual([]);
  });
});

describe('buildData', () => {
  it('strips the Říčany, prefix and lists serving lines', () => {
    const a = data.stops.stops[idx('UA')];
    expect(a.name).toBe('Alfa');
    expect(a.lines).toEqual(['L1731']);
    expect(data.stops.stops[idx('UD')].lines).toEqual(['L1733']);
  });
  it('precomputes footpaths ≤ 400 m both ways', () => {
    const c = data.stops.stops[idx('UC')];
    const toD = c.transfers.find(([to]) => to === idx('UD'));
    expect(toD).toBeDefined();
    expect(toD![1]).toBeGreaterThan(170);
    expect(toD![1]).toBeLessThan(210);
    expect(data.stops.stops[idx('UD')].transfers.some(([to]) => to === idx('UC'))).toBe(true);
    expect(data.stops.stops[idx('UA')].transfers).toEqual([]);
  });
  it('groups trips into patterns sorted by first departure', () => {
    const p = data.timetable.patterns.find((x) => x.routeId === 'L1731' && x.directionId === 0)!;
    expect(p.stops).toEqual([idx('UA'), idx('UB'), idx('UC')]);
    expect(p.seq).toEqual([1, 2, 3]);
    expect(p.headsign).toBe('Gamma');
    expect(p.trips.map((t) => t.id)).toEqual(['1731_1', '1731_3']);
    expect(p.trips[0]).toEqual({ id: '1731_1', service: 'W', arr: [25200, 25500, 25800], dep: [25200, 25530, 25800] });
    expect(data.timetable.patterns.length).toBe(3);
  });
  it('resolves services per date from yesterday to feed end', () => {
    const keys = Object.keys(data.timetable.servicesByDate).sort();
    expect(keys[0]).toBe('20261014');
    expect(keys[keys.length - 1]).toBe('20261028');
    expect(data.timetable.servicesByDate['20261028']).toEqual(['S']);
  });
  it('builds lines with style, directions, and shape fallback to stop coords', () => {
    const l1 = data.lines.lines.find((l) => l.routeId === 'L1731')!;
    expect(l1.number).toBe('1');
    expect(l1.color).toBe('#E4002B');
    expect(l1.directions.map((d) => d.directionId)).toEqual([0, 1]);
    expect(l1.directions[0].shape).toEqual([[14.65, 49.99], [14.655, 49.995], [14.66, 50]]);
    expect(l1.directions[1].shape).toEqual([[14.66, 50], [14.655, 49.995], [14.65, 49.99]]);
  });
  it('writes meta', () => {
    expect(data.meta).toEqual({ feedStart: '20261015', feedEnd: '20261028', generatedAt: '2026-10-15T04:30:00Z', tripCount: 4 });
  });
});
```

`pipeline/test/validate.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirSource } from '../src/source';
import { extractFree } from '../src/extract';
import { buildData, type BuiltData } from '../src/build';
import { validate } from '../src/validate';

const FIX = fileURLToPath(new URL('./fixture', import.meta.url));
let data: BuiltData;
beforeAll(async () => { data = buildData(await extractFree(dirSource(FIX)), '20261015', 'x'); });
const ok = { requiredRoutes: ['L1731', 'L1733'], minTrips: 1, maxTrips: 10 };

describe('validate', () => {
  it('passes a healthy feed', () => {
    expect(validate(data, '20261015', ok)).toEqual([]);
  });
  it('fails when a free route is missing', () => {
    expect(validate(data, '20261015', { ...ok, requiredRoutes: ['L1731', 'L1732'] })).toContain('missing route L1732');
  });
  it('fails when the feed ends too soon', () => {
    expect(validate(data, '20261025', ok)).toContain('feed ends in 3 days (need ≥ 7)');
  });
  it('fails on implausible trip counts', () => {
    expect(validate(data, '20261015', { ...ok, minTrips: 150 })).toContain('trip count 4 outside 150–10');
  });
  it('fails on non-monotonic times', () => {
    const bad = structuredClone(data);
    bad.timetable.patterns[0].trips[0].arr[2] = 0;
    expect(validate(bad, '20261015', ok).some((e) => e.startsWith('non-monotonic times in trip'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w pipeline`
Expected: FAIL — cannot find `../src/build`.

- [ ] **Step 3: Implement build.ts**

```ts
import {
  FREE_ROUTE_IDS, LINE_STYLE, MAX_TRANSFER_WALK_M, addDays, weekday, daysBetween, haversine, walkSec,
  type FreeRouteId, type StopRec, type StopsFile, type LinesFile, type LineRec, type TimetableFile,
  type MetaFile, type PatternRec,
} from '@rb/shared';
import type { RawFree } from './extract';
import type { Row } from './source';

export interface BuiltData { stops: StopsFile; lines: LinesFile; timetable: TimetableFile; meta: MetaFile }

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const stripCity = (s: string) => s.replace(/^Říčany,\s*/, '');

export function activeServices(calendar: Row[], calendarDates: Row[], date: string): Set<string> {
  const wd = DAYS[weekday(date)];
  const s = new Set<string>();
  for (const c of calendar) if (c.start_date <= date && date <= c.end_date && c[wd] === '1') s.add(c.service_id);
  for (const d of calendarDates) {
    if (d.date !== date) continue;
    if (d.exception_type === '1') s.add(d.service_id);
    else s.delete(d.service_id);
  }
  return s;
}

/** Drop points closer than minM to the previously kept point; round to 5 decimals. */
function simplify(points: [number, number][], minM = 10): [number, number][] {
  if (points.length <= 2) return points.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [lx, ly] = out[out.length - 1];
    if (haversine(ly, lx, points[i][1], points[i][0]) >= minM) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
}

export function buildData(raw: RawFree, today: string, generatedAt: string): BuiltData {
  // Stops
  const stopIds = [...raw.stops.keys()].sort();
  const idx = new Map(stopIds.map((id, i) => [id, i]));
  const stops: StopRec[] = stopIds.map((id) => {
    const s = raw.stops.get(id)!;
    return { id, name: stripCity(s.name), platform: s.platform, lat: s.lat, lon: s.lon, lines: [], transfers: [] };
  });
  for (const t of raw.trips) {
    for (const st of t.stopTimes) {
      const s = stops[idx.get(st.stopId)!];
      if (!s.lines.includes(t.routeId)) s.lines.push(t.routeId);
    }
  }
  for (const s of stops) s.lines.sort((a, b) => FREE_ROUTE_IDS.indexOf(a) - FREE_ROUTE_IDS.indexOf(b));
  for (let i = 0; i < stops.length; i++) {
    for (let j = 0; j < stops.length; j++) {
      if (i === j) continue;
      const m = haversine(stops[i].lat, stops[i].lon, stops[j].lat, stops[j].lon);
      if (m <= MAX_TRANSFER_WALK_M) stops[i].transfers.push([j, walkSec(m)]);
    }
  }

  // Patterns (unique route + direction + stop/seq list)
  const byKey = new Map<string, PatternRec & { shapeId: string }>();
  for (const t of raw.trips) {
    const key = `${t.routeId}|${t.directionId}|${t.stopTimes.map((s) => `${s.stopId}@${s.seq}`).join(',')}`;
    let p = byKey.get(key);
    if (!p) {
      p = {
        routeId: t.routeId, directionId: t.directionId, headsign: stripCity(t.headsign),
        stops: t.stopTimes.map((s) => idx.get(s.stopId)!), seq: t.stopTimes.map((s) => s.seq),
        trips: [], shapeId: t.shapeId,
      };
      byKey.set(key, p);
    }
    p.trips.push({ id: t.id, service: t.serviceId, arr: t.stopTimes.map((s) => s.arr), dep: t.stopTimes.map((s) => s.dep) });
  }
  const withShape = [...byKey.values()];
  for (const p of withShape) p.trips.sort((a, b) => a.dep[0] - b.dep[0]);
  withShape.sort((a, b) =>
    FREE_ROUTE_IDS.indexOf(a.routeId) - FREE_ROUTE_IDS.indexOf(b.routeId) || a.directionId - b.directionId || b.trips.length - a.trips.length);
  const patterns: PatternRec[] = withShape.map(({ shapeId: _s, ...p }) => p);

  // Services per date: yesterday … feed end
  const servicesByDate: Record<string, string[]> = {};
  const end = raw.feedInfo.end || addDays(today, 14);
  for (let d = addDays(today, -1); d <= end && daysBetween(today, d) <= 16; d = addDays(d, 1)) {
    servicesByDate[d] = [...activeServices(raw.calendar, raw.calendarDates, d)].sort();
  }

  // Lines: per direction, the pattern with the most stops
  const lines: LineRec[] = [];
  for (const routeId of FREE_ROUTE_IDS) {
    const ps = withShape.filter((p) => p.routeId === routeId);
    if (!ps.length) continue;
    const dirs = [...new Set(ps.map((p) => p.directionId))].sort();
    lines.push({
      routeId, ...LINE_STYLE[routeId as FreeRouteId], longName: raw.routes.get(routeId)?.longName ?? '',
      directions: dirs.map((directionId) => {
        const best = ps.filter((p) => p.directionId === directionId).sort((a, b) => b.stops.length - a.stops.length)[0];
        const shape = raw.shapes.get(best.shapeId) ?? best.stops.map((i) => [stops[i].lon, stops[i].lat] as [number, number]);
        return { directionId, headsign: best.headsign, stops: best.stops, shape: simplify(shape) };
      }),
    });
  }

  const tripCount = patterns.reduce((n, p) => n + p.trips.length, 0);
  return {
    stops: { stops },
    lines: { lines },
    timetable: { patterns, servicesByDate },
    meta: { feedStart: raw.feedInfo.start, feedEnd: raw.feedInfo.end, generatedAt, tripCount },
  };
}
```

- [ ] **Step 4: Implement validate.ts**

```ts
import { FREE_ROUTE_IDS, daysBetween } from '@rb/shared';
import type { BuiltData } from './build';

export function validate(
  data: BuiltData,
  today: string,
  { requiredRoutes = FREE_ROUTE_IDS, minTrips = 150, maxTrips = 600, minDaysLeft = 7 }: {
    requiredRoutes?: readonly string[]; minTrips?: number; maxTrips?: number; minDaysLeft?: number;
  } = {},
): string[] {
  const errors: string[] = [];
  const have = new Set(data.timetable.patterns.map((p) => p.routeId as string));
  for (const r of requiredRoutes) if (!have.has(r)) errors.push(`missing route ${r}`);
  const n = data.meta.tripCount;
  if (n < minTrips || n > maxTrips) errors.push(`trip count ${n} outside ${minTrips}–${maxTrips}`);
  const left = daysBetween(today, data.meta.feedEnd);
  if (!(left >= minDaysLeft)) errors.push(`feed ends in ${left} days (need ≥ ${minDaysLeft})`);
  for (const s of data.stops.stops) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || s.lat === 0 || s.lon === 0) errors.push(`stop ${s.id} has no coordinates`);
  }
  for (const p of data.timetable.patterns) {
    for (const t of p.trips) {
      let last = -1;
      for (let i = 0; i < p.stops.length; i++) {
        if (t.arr[i] < last || t.dep[i] < t.arr[i]) { errors.push(`non-monotonic times in trip ${t.id}`); break; }
        last = t.dep[i];
      }
    }
  }
  return errors;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -w pipeline && npm run typecheck -w pipeline`
Expected: all PASS.

- [ ] **Step 6: Implement cli.ts**

```ts
import { createWriteStream, mkdirSync, writeFileSync, statSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { pragueNow } from '@rb/shared';
import { zipSource } from './source';
import { extractFree } from './extract';
import { buildData } from './build';
import { validate } from './validate';

const FEED_URL = 'https://data.pid.cz/PID_GTFS.zip';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/public/data');

async function download(): Promise<string> {
  const file = join(mkdtempSync(join(tmpdir(), 'pid-')), 'PID_GTFS.zip');
  const res = await fetch(FEED_URL);
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
  return file;
}

async function main() {
  const zip = process.argv[2] ?? (await download());
  const today = pragueNow().date;
  const data = buildData(await extractFree(zipSource(zip)), today, new Date().toISOString());
  const errors = validate(data, today);
  if (errors.length) {
    console.error('Validation failed — keeping previous data:\n' + errors.map((e) => ` - ${e}`).join('\n'));
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  for (const [name, value] of Object.entries({ stops: data.stops, lines: data.lines, timetable: data.timetable, meta: data.meta })) {
    const p = join(OUT, `${name}.json`);
    writeFileSync(p, JSON.stringify(value));
    console.log(`${name}.json ${(statSync(p).size / 1024).toFixed(1)} KB`);
  }
  console.log(`OK: ${data.meta.tripCount} trips, ${data.stops.stops.length} stops, feed ${data.meta.feedStart}–${data.meta.feedEnd}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 7: Run against the real feed**

Run: `npm run data`
Expected (numbers approximate): `stops.json ~60 KB`, `lines.json ~40 KB`, `timetable.json ~150 KB`, `meta.json`, and `OK: ~295 trips, 95 stops, feed 2026MMDD–2026MMDD`. Total < 500 KB. If it prints "Validation failed", read the errors — do not loosen bounds unless the real data proves them wrong (then update both validate defaults and this plan's note).

Sanity check: `node -e "const s=require('./app/public/data/stops.json').stops; console.log(s.length, s.slice(0,3).map(x=>x.name))"` → 95 and names without "Říčany,".

- [ ] **Step 8: Commit and push (data included)**

```bash
git add -A && git commit -m "feat(pipeline): build compact JSON with validation gate; first data snapshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 4: Live-delay Cloudflare Worker

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.toml`, `worker/src/pb.ts`, `worker/src/filter.ts`, `worker/src/index.ts`, `worker/scripts/make-fixture.mjs`
- Create fixture: `worker/test/fixture/trip_updates.pb` (captured)
- Test: `worker/test/pb.test.ts`, `worker/test/handler.test.ts`

**Interfaces:**
- Consumes: `FREE_ROUTE_IDS`, `DelaysResponse` from `@rb/shared`.
- Produces: `decodeTripUpdates(buf: Uint8Array): { timestamp: number; updates: TripUpdate[] }` with `TripUpdate = { trip: { tripId: string|null; routeId: string|null; startDate: string|null } | null; delay: number|null; stopTimeUpdates: { stopSequence: number|null; stopId: string|null; arrivalDelay: number|null; departureDelay: number|null }[] }`; `filterDelays(feed): DelaysResponse`; `createHandler(deps: { fetchUpstream: () => Promise<Response>; now: () => number }): (req: Request) => Promise<Response>`; deployed endpoint `GET https://ricany-bus-live.pokeypoke.workers.dev/delays` → `DelaysResponse` JSON, CORS `*`, `Cache-Control: public, max-age=15`; 503 `{error}` on upstream failure; 404 otherwise.

- [ ] **Step 1: Package setup**

`worker/package.json`:
```json
{
  "name": "@rb/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "deploy": "npx --yes wrangler@4 deploy"
  },
  "dependencies": { "@rb/shared": "*" }
}
```
`worker/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src", "test"] }
```
`worker/wrangler.toml`:
```toml
name = "ricany-bus-live"
main = "src/index.ts"
compatibility_date = "2026-10-01"
workers_dev = true
```
Run: `npm i -D -w worker vitest typescript @types/node`
(The Worker uses only standard `Request`/`Response`/`fetch`, so `@cloudflare/workers-types` is deliberately not used — it conflicts with the DOM lib.)

- [ ] **Step 2: Capture a real fixture (during service hours 6–21 Mon–Sat)**

`worker/scripts/make-fixture.mjs`:
```js
// Usage: node worker/scripts/make-fixture.mjs in.pb out.pb
// Keeps the FeedHeader, every free-line entity (raw bytes contain "L173x") and the first 40 others.
import { readFileSync, writeFileSync } from 'node:fs';
const [, , input, output] = process.argv;
const buf = readFileSync(input);
let pos = 0;
const varint = () => { let r = 0, s = 0, b; do { b = buf[pos++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
const parts = [];
let others = 0, free = 0;
while (pos < buf.length) {
  const start = pos;
  const field = Math.floor(varint() / 8);
  const len = varint();
  const end = pos + len;
  if (field === 1) parts.push(buf.subarray(start, end));
  else if (field === 2) {
    const isFree = /L173[1-7]/.test(buf.subarray(pos, end).toString('latin1'));
    if (isFree) free++;
    if (isFree || others++ < 40) parts.push(buf.subarray(start, end));
  }
  pos = end;
}
writeFileSync(output, Buffer.concat(parts));
console.log(`kept ${free} free + ${Math.min(others, 40)} other entities`);
```
Run:
```bash
mkdir -p worker/test/fixture
curl -sSf -o "$TMPDIR/tu.pb" https://api.golemio.cz/v2/vehiclepositions/gtfsrt/trip_updates.pb
node worker/scripts/make-fixture.mjs "$TMPDIR/tu.pb" worker/test/fixture/trip_updates.pb
```
Expected: `kept N free + 40 other entities` with N ≥ 1. If N = 0 (night/Sunday), wait until service hours and retry (use the Monitor tool with an until-loop; do not skip).

- [ ] **Step 3: Write failing tests**

`worker/test/pb.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeTripUpdates } from '../src/pb';
import { filterDelays } from '../src/filter';

// Tiny protobuf encoder for synthetic feeds
const varint = (n: bigint) => { const out: number[] = []; let v = BigInt.asUintN(64, n); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return out; };
const tag = (f: number, wt: number) => varint(BigInt(f * 8 + wt));
const vi = (f: number, n: number) => [...tag(f, 0), ...varint(BigInt(n))];
const str = (f: number, s: string) => { const b = [...new TextEncoder().encode(s)]; return [...tag(f, 2), ...varint(BigInt(b.length)), ...b]; };
const msg = (f: number, body: number[]) => [...tag(f, 2), ...varint(BigInt(body.length)), ...body];

const entity = (tripId: string, routeId: string, startDate: string, stus: number[][]) =>
  msg(2, [...str(1, 'e-' + tripId), ...msg(3, [
    ...msg(1, [...str(1, tripId), ...str(3, startDate), ...str(5, routeId)]),
    ...stus.flat(),
  ])]);
const stu = (seq: number, depDelay: number, stopId: string) => msg(2, [...vi(1, seq), ...msg(3, vi(1, depDelay)), ...str(4, stopId)]);

const synthetic = new Uint8Array([
  ...msg(1, [...str(1, '2.0'), ...vi(3, 1792068643)]),
  ...entity('1731_1_1', 'L1731', '20261015', [stu(1, -30, 'U1Z1'), stu(2, 90, 'U2Z1')]),
  ...entity('131_9_9', 'L131', '20261015', [stu(1, 10, 'U9Z9')]),
]);

describe('decodeTripUpdates', () => {
  it('decodes header timestamp, trip descriptor and negative delays', () => {
    const f = decodeTripUpdates(synthetic);
    expect(f.timestamp).toBe(1792068643);
    expect(f.updates.length).toBe(2);
    expect(f.updates[0].trip).toEqual({ tripId: '1731_1_1', routeId: 'L1731', startDate: '20261015' });
    expect(f.updates[0].stopTimeUpdates[0]).toEqual({ stopSequence: 1, stopId: 'U1Z1', arrivalDelay: null, departureDelay: -30 });
  });
  it('decodes the captured real feed', () => {
    const f = decodeTripUpdates(new Uint8Array(readFileSync(new URL('./fixture/trip_updates.pb', import.meta.url))));
    expect(f.timestamp).toBeGreaterThan(1.7e9);
    expect(f.updates.length).toBeGreaterThan(40);
    expect(f.updates.every((u) => typeof u.trip?.tripId === 'string')).toBe(true);
  });
});

describe('filterDelays', () => {
  it('keeps only free-line trips, keyed by trip id with per-sequence delays', () => {
    const d = filterDelays(decodeTripUpdates(synthetic));
    expect(d).toEqual({ generatedAt: 1792068643, trips: { '1731_1_1': { startDate: '20261015', delay: 90, stops: { 1: -30, 2: 90 } } } });
  });
  it('real feed: every kept trip is a free line', () => {
    const d = filterDelays(decodeTripUpdates(new Uint8Array(readFileSync(new URL('./fixture/trip_updates.pb', import.meta.url)))));
    const ids = Object.keys(d.trips);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => /^173[1-7]_/.test(id))).toBe(true);
    expect(JSON.stringify(d).length).toBeLessThan(50_000);
  });
});
```

`worker/test/handler.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHandler } from '../src/index';

const pb = readFileSync(new URL('./fixture/trip_updates.pb', import.meta.url));
const ok = () => Promise.resolve(new Response(pb, { status: 200 }));
const req = (path: string, method = 'GET') => new Request('https://w.example' + path, { method });

describe('handler', () => {
  it('serves /delays with CORS and cache headers', async () => {
    const h = createHandler({ fetchUpstream: ok, now: () => 0 });
    const res = await h(req('/delays'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('public, max-age=15');
    const body = await res.json();
    expect(Object.keys(body.trips).length).toBeGreaterThan(0);
  });
  it('memoizes upstream for 15 s', async () => {
    let t = 0;
    const fetchUpstream = vi.fn(ok);
    const h = createHandler({ fetchUpstream, now: () => t });
    await h(req('/delays'));
    t = 10_000; await h(req('/delays'));
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
    t = 16_000; await h(req('/delays'));
    expect(fetchUpstream).toHaveBeenCalledTimes(2);
  });
  it('returns 503 when upstream fails', async () => {
    const h = createHandler({ fetchUpstream: () => Promise.resolve(new Response('x', { status: 500 })), now: () => 0 });
    const res = await h(req('/delays'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/upstream 500/);
  });
  it('404s other paths and answers OPTIONS', async () => {
    const h = createHandler({ fetchUpstream: ok, now: () => 0 });
    expect((await h(req('/nope'))).status).toBe(404);
    expect((await h(req('/delays', 'OPTIONS'))).status).toBe(204);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -w worker`
Expected: FAIL — cannot find `../src/pb`.

- [ ] **Step 5: Implement**

`worker/src/pb.ts` (validated against `gtfs-realtime-bindings` on the live feed during planning: 4415/4415 entities identical, negative delays correct):
```ts
// Minimal protobuf reader for the GTFS-RT TripUpdate subset we need.
// Field numbers from gtfs-realtime.proto: FeedMessage{header=1, entity=2}, FeedHeader{timestamp=3},
// FeedEntity{trip_update=3}, TripUpdate{trip=1, stop_time_update=2, delay=5},
// TripDescriptor{trip_id=1, start_date=3, route_id=5}, StopTimeUpdate{stop_sequence=1, arrival=2, departure=3, stop_id=4},
// StopTimeEvent{delay=1}.
class Reader {
  constructor(private buf: Uint8Array, public pos = 0, private end = buf.length) {}
  private varint(): { lo: number; hi: number } {
    let lo = 0, hi = 0, shift = 0, b: number;
    do {
      b = this.buf[this.pos++];
      if (shift < 28) lo |= (b & 0x7f) << shift;
      else if (shift === 28) { lo |= (b & 0x0f) << 28; hi |= (b & 0x7f) >> 4; }
      else hi |= (b & 0x7f) << (shift - 32);
      shift += 7;
    } while (b & 0x80);
    return { lo: lo >>> 0, hi: hi >>> 0 };
  }
  uint(): number { const { lo, hi } = this.varint(); return hi * 4294967296 + lo; }
  int32(): number { return this.varint().lo | 0; }
  private span(): [number, number] { const n = this.uint(); const s = this.pos; this.pos += n; return [s, this.pos]; }
  string(): string { const [s, e] = this.span(); return new TextDecoder().decode(this.buf.subarray(s, e)); }
  sub(): Reader { const [s, e] = this.span(); return new Reader(this.buf, s, e); }
  skip(wt: number): void {
    if (wt === 0) this.varint();
    else if (wt === 1) this.pos += 8;
    else if (wt === 2) this.span();
    else if (wt === 5) this.pos += 4;
    else throw new Error('unsupported wire type ' + wt);
  }
  *fields(): Generator<[number, number]> {
    while (this.pos < this.end) { const k = this.uint(); yield [Math.floor(k / 8), k & 7]; }
  }
}

export interface StopTimeUpdate { stopSequence: number | null; stopId: string | null; arrivalDelay: number | null; departureDelay: number | null }
export interface TripUpdate {
  trip: { tripId: string | null; routeId: string | null; startDate: string | null } | null;
  delay: number | null;
  stopTimeUpdates: StopTimeUpdate[];
}

function readEvent(r: Reader): number | null {
  let delay: number | null = null;
  for (const [f, wt] of r.fields()) { if (f === 1 && wt === 0) delay = r.int32(); else r.skip(wt); }
  return delay;
}
function readStu(r: Reader): StopTimeUpdate {
  const s: StopTimeUpdate = { stopSequence: null, stopId: null, arrivalDelay: null, departureDelay: null };
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 0) s.stopSequence = r.uint();
    else if (f === 2 && wt === 2) s.arrivalDelay = readEvent(r.sub());
    else if (f === 3 && wt === 2) s.departureDelay = readEvent(r.sub());
    else if (f === 4 && wt === 2) s.stopId = r.string();
    else r.skip(wt);
  }
  return s;
}
function readTrip(r: Reader): NonNullable<TripUpdate['trip']> {
  const t = { tripId: null as string | null, routeId: null as string | null, startDate: null as string | null };
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) t.tripId = r.string();
    else if (f === 3 && wt === 2) t.startDate = r.string();
    else if (f === 5 && wt === 2) t.routeId = r.string();
    else r.skip(wt);
  }
  return t;
}
function readTripUpdate(r: Reader): TripUpdate {
  const u: TripUpdate = { trip: null, delay: null, stopTimeUpdates: [] };
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) u.trip = readTrip(r.sub());
    else if (f === 2 && wt === 2) u.stopTimeUpdates.push(readStu(r.sub()));
    else if (f === 5 && wt === 0) u.delay = r.int32();
    else r.skip(wt);
  }
  return u;
}

export function decodeTripUpdates(buf: Uint8Array): { timestamp: number; updates: TripUpdate[] } {
  const r = new Reader(buf);
  let timestamp = 0;
  const updates: TripUpdate[] = [];
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) {
      const h = r.sub();
      for (const [hf, hwt] of h.fields()) { if (hf === 3 && hwt === 0) timestamp = h.uint(); else h.skip(hwt); }
    } else if (f === 2 && wt === 2) {
      const e = r.sub();
      for (const [ef, ewt] of e.fields()) { if (ef === 3 && ewt === 2) updates.push(readTripUpdate(e.sub())); else e.skip(ewt); }
    } else r.skip(wt);
  }
  return { timestamp, updates };
}
```

`worker/src/filter.ts`:
```ts
import { FREE_ROUTE_IDS, type DelaysResponse } from '@rb/shared';
import type { TripUpdate } from './pb';

const FREE = new Set<string>(FREE_ROUTE_IDS);

export function filterDelays(feed: { timestamp: number; updates: TripUpdate[] }): DelaysResponse {
  const trips: DelaysResponse['trips'] = {};
  for (const u of feed.updates) {
    const t = u.trip;
    if (!t?.tripId || !t.routeId || !FREE.has(t.routeId)) continue;
    const stops: Record<number, number> = {};
    let last: number | null = null;
    for (const s of u.stopTimeUpdates) {
      const d = s.departureDelay ?? s.arrivalDelay;
      if (s.stopSequence != null && d != null) { stops[s.stopSequence] = d; last = d; }
    }
    trips[t.tripId] = { startDate: t.startDate ?? '', delay: u.delay ?? last ?? 0, stops };
  }
  return { generatedAt: feed.timestamp, trips };
}
```

`worker/src/index.ts` (the Cache API is a no-op on `*.workers.dev`, so we memoize in the isolate):
```ts
import { decodeTripUpdates } from './pb';
import { filterDelays } from './filter';

const UPSTREAM = 'https://api.golemio.cz/v2/vehiclepositions/gtfsrt/trip_updates.pb';
const TTL_MS = 15_000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

export function createHandler(deps: { fetchUpstream: () => Promise<Response>; now: () => number }) {
  let memo: { at: number; body: string } | null = null;
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (new URL(req.url).pathname !== '/delays') return json({ error: 'not found' }, 404);
    if (!memo || deps.now() - memo.at >= TTL_MS) {
      try {
        const up = await deps.fetchUpstream();
        if (!up.ok) throw new Error('upstream ' + up.status);
        const body = JSON.stringify(filterDelays(decodeTripUpdates(new Uint8Array(await up.arrayBuffer()))));
        memo = { at: deps.now(), body };
      } catch (e) {
        return json({ error: String(e instanceof Error ? e.message : e) }, 503);
      }
    }
    return new Response(memo.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15', ...CORS },
    });
  };
}

const handler = createHandler({ fetchUpstream: () => fetch(UPSTREAM), now: () => Date.now() });
export default { fetch: (req: Request) => handler(req) };
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -w worker && npm run typecheck -w worker`
Expected: 8 tests PASS.

- [ ] **Step 7: Deploy and smoke-test**

```bash
cd worker && npx --yes wrangler@4 deploy && cd ..
curl -s https://ricany-bus-live.pokeypoke.workers.dev/delays | head -c 400; echo
curl -sI https://ricany-bus-live.pokeypoke.workers.dev/delays | grep -i -E 'access-control|cache-control'
```
Expected: deploy prints `https://ricany-bus-live.pokeypoke.workers.dev`; body starts with `{"generatedAt":17…,"trips":{` (trips may be `{}` outside service hours); headers show `access-control-allow-origin: *` and `cache-control: public, max-age=15`. If wrangler says the OAuth token expired, run `npx --yes wrangler@4 whoami` (it refreshes automatically); if it still fails, record in papercuts and continue with other tasks, retrying deploy at the end of Task 17.

- [ ] **Step 8: Commit and push**

```bash
git add -A && git commit -m "feat(worker): free-line GTFS-RT delay proxy on Cloudflare Workers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---
### Task 5: Router core — network per date and RAPTOR

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/vitest.config.ts`
- Create: `app/src/router/types.ts`, `app/src/router/network.ts`, `app/src/router/raptor.ts`
- Create: `app/test/fixtures/net.ts`
- Test: `app/test/raptor.test.ts`

**Interfaces:**
- Consumes: `StopRec`, `TimetableFile`, `FreeRouteId`, `addDays`, `MIN_TRANSFER_SEC`, `MAX_RIDES` from `@rb/shared`.
- Produces:
  ```ts
  // types.ts
  interface PlaceRef { lat: number; lon: number; name: string }
  interface BikeStation { uid: number; name: string; lat: number; lon: number; bikes: number; freeRacks: number }
  type Leg =
    | { kind: 'walk'; from: PlaceRef; to: PlaceRef; depart: number; arrive: number; meters: number }
    | { kind: 'bus'; routeId: FreeRouteId; headsign: string; tripId: string; serviceDate: string; pattern: number;
        boardPos: number; alightPos: number; boardSeq: number; alightSeq: number; from: number; to: number;
        depart: number; arrive: number; stopCount: number }
    | { kind: 'bike'; from: BikeStation; to: BikeStation; depart: number; arrive: number; meters: number };
  interface Itinerary { date: string; depart: number; arrive: number; rides: number; free: boolean; legs: Leg[] }
  interface PlanRequest { from: PlaceRef; to: PlaceRef; mode: 'dep' | 'arr'; date: string; sec: number }
  interface PlanResult { free: Itinerary[]; bike: Itinerary[]; walk: Itinerary | null; nearOrigin: number; nearDest: number }
  interface StopAccess { stop: number; sec: number; legs?: (start: number) => Leg[] }
  // network.ts
  interface NetTrip { id: string; serviceDate: string; arr: number[]; dep: number[] }
  interface NetPattern { routeId: FreeRouteId; directionId: number; headsign: string; stops: number[]; seq: number[]; trips: NetTrip[] }
  interface Network { date: string; stops: StopRec[]; patterns: NetPattern[]; stopPatterns: { p: number; pos: number }[][] }
  function buildNetwork(stops: StopRec[], tt: TimetableFile, date: string): Network
  // raptor.ts
  interface RideStep { kind: 'ride'; p: number; trip: number; boardPos: number; alightPos: number }
  interface FootStep { kind: 'foot'; from: number; to: number; sec: number }
  interface Journey { rides: number; access: StopAccess; egress: StopAccess; steps: (RideStep | FootStep)[]; arrive: number; firstDepart: number }
  function raptor(net: Network, access: StopAccess[], egress: StopAccess[], departSec: number, maxRides?: number): Journey[]
  ```
  `raptor` returns the Pareto set over (arrival, rides), ordered by increasing rides (each later journey arrives strictly earlier). Pattern indices in `Network.patterns` equal indices in `TimetableFile.patterns`.

- [ ] **Step 1: App package skeleton (Svelte comes in Task 10)**

`app/package.json`:
```json
{
  "name": "@rb/app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": { "@rb/shared": "*" }
}
```
`app/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"], "allowImportingTsExtensions": false },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```
`app/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } });
```
Run: `npm i -D -w app vitest typescript @types/node`

- [ ] **Step 2: Synthetic network fixture**

`app/test/fixtures/net.ts`:
```ts
import type { StopRec, TimetableFile, PatternRec, TripRec } from '@rb/shared';

export const H = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

// Six stops on one meridian, ~1.56 km apart (beyond 1.2 km walking), except S3 which is 167 m from S2.
const LATS = [49.99, 50.004, 50.018, 50.0195, 50.033, 50.047];
export const stops: StopRec[] = LATS.map((lat, i) => ({
  id: 'S' + i, name: 'S' + i, platform: 'A', lat, lon: 14.65, lines: [], transfers: [],
}));
stops[2].transfers.push([3, 174]);
stops[3].transfers.push([2, 174]);

const trip = (id: string, service: string, start: number, offsets: number[]): TripRec => ({
  id, service, arr: offsets.map((o) => start + o), dep: offsets.map((o) => start + o),
});

export const patterns: PatternRec[] = [
  // P0: S0 → S1 → S2
  { routeId: 'L1731', directionId: 0, headsign: 'S2', stops: [0, 1, 2], seq: [1, 2, 3],
    trips: [trip('a1', 'W', H(8, 0), [0, 300, 600]), trip('a2', 'W', H(8, 30), [0, 300, 600])] },
  // P1: S3 → S4 (walk transfer from S2)
  { routeId: 'L1733', directionId: 0, headsign: 'S4', stops: [3, 4], seq: [1, 2],
    trips: [trip('b1', 'W', H(8, 15), [0, 360]), trip('b2', 'W', H(8, 45), [0, 360])] },
  // P2: S2 → S5 (c1 leaves 30 s after a1 arrives: too tight for the 60 s same-stop rule)
  { routeId: 'L1732', directionId: 0, headsign: 'S5', stops: [2, 5], seq: [1, 2],
    trips: [trip('c1', 'W', H(8, 10, 30), [0, 480]), trip('c2', 'W', H(8, 25), [0, 480])] },
  // P3: slow direct S0 → S5
  { routeId: 'L1737', directionId: 0, headsign: 'S5', stops: [0, 5], seq: [1, 2],
    trips: [trip('d1', 'W', H(8, 0), [0, 3600])] },
  // P4: after-midnight trip belonging to the previous service day
  { routeId: 'L1736', directionId: 0, headsign: 'S2', stops: [1, 2], seq: [1, 2],
    trips: [trip('n1', 'N', H(24, 10), [0, 300])] },
];

export const timetable: TimetableFile = {
  patterns,
  servicesByDate: { '20261018': ['N'], '20261019': ['W'], '20261020': ['W'] },
};
```

- [ ] **Step 3: Write failing tests**

`app/test/raptor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { raptor } from '../src/router/raptor';
import { stops, timetable, H } from './fixtures/net';

const net = buildNetwork(stops, timetable, '20261019');
const at = (stop: number) => [{ stop, sec: 0 }];

describe('buildNetwork', () => {
  it('includes only trips active on the date, plus previous-day trips past midnight shifted by −24 h', () => {
    expect(net.patterns[0].trips.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(net.patterns[4].trips).toEqual([{ id: 'n1', serviceDate: '20261018', arr: [600, 900], dep: [600, 900] }]);
    expect(buildNetwork(stops, timetable, '20261018').patterns[0].trips).toEqual([]);
  });
  it('indexes patterns per stop', () => {
    expect(net.stopPatterns[2]).toEqual([{ p: 0, pos: 2 }, { p: 2, pos: 0 }, { p: 4, pos: 1 }]);
  });
});

describe('raptor', () => {
  it('finds a direct ride', () => {
    const js = raptor(net, at(0), at(2), H(7, 55));
    expect(js.length).toBe(1);
    expect(js[0]).toMatchObject({ rides: 1, arrive: H(8, 10), firstDepart: H(8, 0) });
  });
  it('keeps the Pareto set: slow direct and faster with a transfer; respects 60 s same-stop transfer', () => {
    const js = raptor(net, at(0), at(5), H(7, 55));
    expect(js.map((j) => [j.rides, j.arrive])).toEqual([[1, H(9, 0)], [2, H(8, 33)]]);
    const second = js[1].steps.filter((s) => s.kind === 'ride');
    expect(second.map((s) => net.patterns[s.p].trips[s.trip].id)).toEqual(['a1', 'c2']);
  });
  it('uses walking transfers between nearby stops', () => {
    const js = raptor(net, at(0), at(4), H(7, 55));
    expect(js.length).toBe(1);
    expect(js[0].arrive).toBe(H(8, 21));
    expect(js[0].steps.map((s) => s.kind)).toEqual(['ride', 'foot', 'ride']);
  });
  it('caps the number of rides', () => {
    const js = raptor(net, at(0), at(5), H(7, 55), 1);
    expect(js.map((j) => j.arrive)).toEqual([H(9, 0)]);
  });
  it('returns nothing after the last bus', () => {
    expect(raptor(net, at(0), at(5), H(9, 30))).toEqual([]);
  });
  it('rides previous-day trips after midnight', () => {
    const js = raptor(net, at(1), at(2), 0);
    expect(js[0].arrive).toBe(900);
  });
  it('adds access and egress durations', () => {
    const js = raptor(net, [{ stop: 0, sec: 120 }], [{ stop: 2, sec: 90 }], H(7, 58));
    expect(js[0].arrive).toBe(H(8, 10) + 90);
    expect(raptor(net, [{ stop: 0, sec: 180 }], [{ stop: 2, sec: 0 }], H(7, 58))[0].firstDepart).toBe(H(8, 30));
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -w app`
Expected: FAIL — cannot find `../src/router/network`.

- [ ] **Step 5: Implement types.ts**

`app/src/router/types.ts`:
```ts
import type { FreeRouteId } from '@rb/shared';

export interface PlaceRef { lat: number; lon: number; name: string }
export interface BikeStation { uid: number; name: string; lat: number; lon: number; bikes: number; freeRacks: number }

export type Leg =
  | { kind: 'walk'; from: PlaceRef; to: PlaceRef; depart: number; arrive: number; meters: number }
  | {
      kind: 'bus'; routeId: FreeRouteId; headsign: string; tripId: string; serviceDate: string; pattern: number;
      boardPos: number; alightPos: number; boardSeq: number; alightSeq: number; from: number; to: number;
      depart: number; arrive: number; stopCount: number;
    }
  | { kind: 'bike'; from: BikeStation; to: BikeStation; depart: number; arrive: number; meters: number };

export interface Itinerary { date: string; depart: number; arrive: number; rides: number; free: boolean; legs: Leg[] }
export interface PlanRequest { from: PlaceRef; to: PlaceRef; mode: 'dep' | 'arr'; date: string; sec: number }
export interface PlanResult { free: Itinerary[]; bike: Itinerary[]; walk: Itinerary | null; nearOrigin: number; nearDest: number }
export interface StopAccess { stop: number; sec: number; legs?: (start: number) => Leg[] }
```

- [ ] **Step 6: Implement network.ts**

```ts
import { addDays, type FreeRouteId, type StopRec, type TimetableFile } from '@rb/shared';

export interface NetTrip { id: string; serviceDate: string; arr: number[]; dep: number[] }
export interface NetPattern { routeId: FreeRouteId; directionId: number; headsign: string; stops: number[]; seq: number[]; trips: NetTrip[] }
export interface Network { date: string; stops: StopRec[]; patterns: NetPattern[]; stopPatterns: { p: number; pos: number }[][] }

export function buildNetwork(stops: StopRec[], tt: TimetableFile, date: string): Network {
  const today = new Set(tt.servicesByDate[date] ?? []);
  const prevDate = addDays(date, -1);
  const prev = new Set(tt.servicesByDate[prevDate] ?? []);
  const patterns: NetPattern[] = tt.patterns.map((p) => {
    const trips: NetTrip[] = [];
    for (const t of p.trips) {
      if (today.has(t.service)) trips.push({ id: t.id, serviceDate: date, arr: t.arr, dep: t.dep });
      if (prev.has(t.service) && t.arr[t.arr.length - 1] >= 86400) {
        trips.push({ id: t.id, serviceDate: prevDate, arr: t.arr.map((x) => x - 86400), dep: t.dep.map((x) => x - 86400) });
      }
    }
    trips.sort((a, b) => a.dep[0] - b.dep[0]);
    return { routeId: p.routeId, directionId: p.directionId, headsign: p.headsign, stops: p.stops, seq: p.seq, trips };
  });
  const stopPatterns = stops.map(() => [] as { p: number; pos: number }[]);
  patterns.forEach((p, pi) => p.stops.forEach((s, pos) => stopPatterns[s].push({ p: pi, pos })));
  return { date, stops, patterns, stopPatterns };
}
```

- [ ] **Step 7: Implement raptor.ts**

```ts
import { MAX_RIDES, MIN_TRANSFER_SEC } from '@rb/shared';
import type { Network, NetPattern } from './network';
import type { StopAccess } from './types';

export interface RideStep { kind: 'ride'; p: number; trip: number; boardPos: number; alightPos: number }
export interface FootStep { kind: 'foot'; from: number; to: number; sec: number }
export interface Journey {
  rides: number; access: StopAccess; egress: StopAccess; steps: (RideStep | FootStep)[];
  arrive: number; firstDepart: number;
}

type Prev =
  | { kind: 'access'; a: StopAccess }
  | { kind: 'ride'; p: number; trip: number; boardPos: number; alightPos: number; boardStop: number }
  | { kind: 'foot'; from: number; sec: number };

/** Index of the trip with the smallest dep[pos] ≥ t (linear scan: robust to overtaking), or −1. */
function earliestTrip(pat: NetPattern, pos: number, t: number): number {
  let best = -1;
  for (let i = 0; i < pat.trips.length; i++) {
    const d = pat.trips[i].dep[pos];
    if (d >= t && (best < 0 || d < pat.trips[best].dep[pos])) best = i;
  }
  return best;
}

export function raptor(net: Network, access: StopAccess[], egress: StopAccess[], departSec: number, maxRides = MAX_RIDES): Journey[] {
  const n = net.stops.length;
  const tau: Float64Array[] = [];
  const prev: (Prev | undefined)[][] = [];
  const byRide: Uint8Array[] = [];
  const best = new Float64Array(n).fill(Infinity);
  const newRound = () => { tau.push(new Float64Array(n).fill(Infinity)); prev.push(new Array(n)); byRide.push(new Uint8Array(n)); };

  newRound();
  let marked = new Set<number>();
  for (const a of access) {
    const t = departSec + a.sec;
    if (t < tau[0][a.stop]) { tau[0][a.stop] = t; best[a.stop] = Math.min(best[a.stop], t); prev[0][a.stop] = { kind: 'access', a }; marked.add(a.stop); }
  }

  let bestDest = Infinity;
  const journeys: Journey[] = [];
  for (let k = 1; k <= maxRides && marked.size; k++) {
    newRound();
    const queue = new Map<number, number>();
    for (const s of marked) {
      for (const { p, pos } of net.stopPatterns[s]) {
        const q = queue.get(p);
        if (q === undefined || pos < q) queue.set(p, pos);
      }
    }
    marked = new Set();
    const rideMarked: number[] = [];

    for (const [pi, startPos] of queue) {
      const pat = net.patterns[pi];
      let trip = -1, boardPos = -1, boardStop = -1;
      for (let pos = startPos; pos < pat.stops.length; pos++) {
        const s = pat.stops[pos];
        if (trip >= 0) {
          const a = pat.trips[trip].arr[pos];
          if (a < best[s] && a < bestDest) {
            tau[k][s] = a; best[s] = a; byRide[k][s] = 1;
            prev[k][s] = { kind: 'ride', p: pi, trip, boardPos, alightPos: pos, boardStop };
            rideMarked.push(s); marked.add(s);
          }
        }
        const prevT = tau[k - 1][s];
        if (prevT < Infinity && pos < pat.stops.length - 1) {
          const ready = prevT + (byRide[k - 1][s] ? MIN_TRANSFER_SEC : 0);
          if (trip < 0 || ready <= pat.trips[trip].dep[pos]) {
            const e = earliestTrip(pat, pos, ready);
            if (e >= 0 && (trip < 0 || pat.trips[e].dep[pos] < pat.trips[trip].dep[pos])) { trip = e; boardPos = pos; boardStop = s; }
          }
        }
      }
    }

    for (const s of rideMarked) {
      if (prev[k][s]?.kind !== 'ride') continue;
      for (const [to, sec] of net.stops[s].transfers) {
        const t = tau[k][s] + sec;
        if (t < best[to] && t < bestDest) {
          tau[k][to] = t; best[to] = t; byRide[k][to] = 0;
          prev[k][to] = { kind: 'foot', from: s, sec };
          marked.add(to);
        }
      }
    }

    let roundBest = Infinity;
    let bestE: StopAccess | null = null;
    for (const e of egress) {
      const t = tau[k][e.stop] + e.sec;
      if (t < roundBest) { roundBest = t; bestE = e; }
    }
    if (bestE && roundBest < bestDest) {
      bestDest = roundBest;
      journeys.push(reconstruct(net, prev, k, bestE, roundBest));
    }
  }
  return journeys;
}

function reconstruct(net: Network, prev: (Prev | undefined)[][], k: number, egress: StopAccess, arrive: number): Journey {
  const steps: (RideStep | FootStep)[] = [];
  let stop = egress.stop;
  let round = k;
  let access: StopAccess | null = null;
  for (;;) {
    const pr = prev[round][stop]!;
    if (pr.kind === 'access') { access = pr.a; break; }
    if (pr.kind === 'foot') { steps.unshift({ kind: 'foot', from: pr.from, to: stop, sec: pr.sec }); stop = pr.from; continue; }
    steps.unshift({ kind: 'ride', p: pr.p, trip: pr.trip, boardPos: pr.boardPos, alightPos: pr.alightPos });
    stop = pr.boardStop;
    round--;
  }
  const first = steps.find((s): s is RideStep => s.kind === 'ride')!;
  return { rides: k, access, egress, steps, arrive, firstDepart: net.patterns[first.p].trips[first.trip].dep[first.boardPos] };
}
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npm test -w app && npm run typecheck -w app`
Expected: 9 tests PASS.

- [ ] **Step 9: Commit and push**

```bash
git add -A && git commit -m "feat(router): per-date network and RAPTOR with walking transfers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 6: Router — trip planning (walk access/egress, repeated search, arrive-by, rollover, walk-only)

**Files:**
- Create: `app/src/router/plan.ts`
- Test: `app/test/plan.test.ts`

**Interfaces:**
- Consumes: `buildNetwork`, `Network` (Task 5); `raptor`, `Journey`, `RideStep` (Task 5); types (Task 5); `haversine`, `walkSec`, `addDays`, `daysBetween`, `MAX_ACCESS_WALK_M` (shared). `bikeAccessOptions`, `bikeEgressOptions`, `bikeOnly` come in Task 7 — in this task `planTrip` ignores its `bikes` argument except to return `bike: []`.
- Produces:
  ```ts
  interface PlanContext { stops: StopRec[]; netFor(date: string): Network }
  function walkOptions(stops: StopRec[], place: PlaceRef, dir: 'access' | 'egress', maxM?: number): StopAccess[]
  function toItinerary(net: Network, j: Journey): Itinerary
  function planTrip(ctx: PlanContext, req: PlanRequest, bikes: BikeStation[] | null): PlanResult
  const MAX_RESULTS = 4
  ```
  `free` is sorted by arrival (mode `dep`) or by departure descending (mode `arr`). Itinerary `date` is the service date the times refer to (may be a later day after rollover). Zero-length walk legs (< 1 m) are omitted.

- [ ] **Step 1: Write failing tests**

`app/test/plan.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { planTrip, type PlanContext } from '../src/router/plan';
import type { PlaceRef } from '../src/router/types';
import { stops, timetable, H } from './fixtures/net';

const ctx: PlanContext = { stops, netFor: (d) => buildNetwork(stops, timetable, d) };
const at = (i: number, northM = 0): PlaceRef => ({ lat: stops[i].lat + northM / 111195, lon: stops[i].lon, name: 'p' + i });
const dep = (from: PlaceRef, to: PlaceRef, sec: number, date = '20261019') => planTrip(ctx, { from, to, mode: 'dep', date, sec }, null);

describe('planTrip', () => {
  it('returns free itineraries sorted by arrival, without zero-length walks', () => {
    const r = dep(at(0), at(5), H(7, 55));
    expect(r.free.map((f) => f.arrive)).toEqual([H(8, 33), H(9, 0)]);
    expect(r.free.every((f) => f.free && f.date === '20261019')).toBe(true);
    expect(r.free[0].legs.map((l) => l.kind)).toEqual(['bus', 'bus']);
    expect(r.free[0].depart).toBe(H(8, 0));
    expect(r.nearOrigin).toBe(1);
    expect(r.walk).toBeNull();
  });
  it('builds walk legs for access, transfers and egress', () => {
    const r = dep(at(0, -300), at(4, 200), H(7, 50));
    const it0 = r.free[0];
    expect(it0.legs.map((l) => l.kind)).toEqual(['walk', 'bus', 'walk', 'bus', 'walk']);
    const first = it0.legs[0];
    expect(first.arrive).toBe(H(8, 0));
    expect(first.kind === 'walk' && first.meters).toBe(300);
    expect(it0.arrive).toBeGreaterThan(H(8, 21));
  });
  it('arrive-by picks the latest departure that arrives in time', () => {
    const r = planTrip(ctx, { from: at(0), to: at(5), mode: 'arr', date: '20261019', sec: H(8, 40) }, null);
    expect(r.free.length).toBe(1);
    expect(r.free[0]).toMatchObject({ depart: H(8, 0), arrive: H(8, 33), rides: 2 });
  });
  it('rolls over to the next day when nothing runs today (evening and Sunday)', () => {
    const evening = dep(at(0), at(5), H(22, 0));
    expect(evening.free[0]).toMatchObject({ date: '20261020', arrive: H(8, 33) });
    const sunday = dep(at(0), at(5), H(10, 0), '20261018');
    expect(sunday.free[0]).toMatchObject({ date: '20261019', arrive: H(8, 33) });
  });
  it('drops bus trips slower than walking and offers walk-only', () => {
    const r = dep(at(0), at(0, 500), H(7, 55));
    expect(r.walk).not.toBeNull();
    expect(r.walk!.legs.length).toBe(1);
    expect(r.walk!.arrive - r.walk!.depart).toBe(520);
    expect(r.free).toEqual([]);
  });
  it('reports no nearby stops', () => {
    const r = dep({ lat: 49.9, lon: 14.65, name: 'far' }, at(5), H(7, 55));
    expect(r.nearOrigin).toBe(0);
    expect(r.free).toEqual([]);
    expect(r.walk).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w app -- plan`
Expected: FAIL — cannot find `../src/router/plan`.

- [ ] **Step 3: Implement plan.ts**

```ts
import { MAX_ACCESS_WALK_M, addDays, daysBetween, haversine, walkSec, type StopRec } from '@rb/shared';
import type { Network } from './network';
import { raptor, type Journey, type RideStep } from './raptor';
import type { BikeStation, Itinerary, Leg, PlaceRef, PlanRequest, PlanResult, StopAccess } from './types';

export interface PlanContext { stops: StopRec[]; netFor(date: string): Network }

export const MAX_RESULTS = 4;
const HORIZON = 3 * 3600;
const WALK_ONLY_MAX = 30 * 60;
const ROLLOVER_DAYS = 2;
const MAX_ARRIVE_BY_RUNS = 300;

const placeOf = (s: StopRec): PlaceRef => ({ lat: s.lat, lon: s.lon, name: s.name });

export function walkOptions(stops: StopRec[], place: PlaceRef, dir: 'access' | 'egress', maxM = MAX_ACCESS_WALK_M): StopAccess[] {
  const out: StopAccess[] = [];
  stops.forEach((s, i) => {
    const m = haversine(place.lat, place.lon, s.lat, s.lon);
    if (m > maxM) return;
    const sec = walkSec(m);
    const sp = placeOf(s);
    out.push({
      stop: i, sec,
      legs: (start) => (m < 1 ? [] : [{
        kind: 'walk', from: dir === 'access' ? place : sp, to: dir === 'access' ? sp : place,
        depart: start, arrive: start + sec, meters: Math.round(m),
      }]),
    });
  });
  return out;
}

export function toItinerary(net: Network, j: Journey): Itinerary {
  const legs: Leg[] = [];
  const first = j.steps.find((s): s is RideStep => s.kind === 'ride')!;
  const firstDep = net.patterns[first.p].trips[first.trip].dep[first.boardPos];
  legs.push(...(j.access.legs?.(firstDep - j.access.sec) ?? []));
  let t = firstDep;
  for (const s of j.steps) {
    if (s.kind === 'ride') {
      const p = net.patterns[s.p];
      const tr = p.trips[s.trip];
      legs.push({
        kind: 'bus', routeId: p.routeId, headsign: p.headsign, tripId: tr.id, serviceDate: tr.serviceDate, pattern: s.p,
        boardPos: s.boardPos, alightPos: s.alightPos, boardSeq: p.seq[s.boardPos], alightSeq: p.seq[s.alightPos],
        from: p.stops[s.boardPos], to: p.stops[s.alightPos], depart: tr.dep[s.boardPos], arrive: tr.arr[s.alightPos],
        stopCount: s.alightPos - s.boardPos,
      });
      t = tr.arr[s.alightPos];
    } else {
      const a = net.stops[s.from], b = net.stops[s.to];
      legs.push({ kind: 'walk', from: placeOf(a), to: placeOf(b), depart: t, arrive: t + s.sec, meters: Math.round(haversine(a.lat, a.lon, b.lat, b.lon)) });
      t += s.sec;
    }
  }
  legs.push(...(j.egress.legs?.(t) ?? []));
  return {
    date: net.date, depart: legs[0].depart, arrive: legs[legs.length - 1].arrive, rides: j.rides,
    free: !legs.some((l) => l.kind === 'bike'), legs,
  };
}

const signature = (it: Itinerary) =>
  it.legs.map((l) => (l.kind === 'bus' ? `${l.tripId}:${l.boardPos}-${l.alightPos}` : l.kind === 'bike' ? `bike${l.from.uid}-${l.to.uid}` : '')).join('|');

function dedupe(list: Itinerary[]): Itinerary[] {
  const seen = new Set<string>();
  return list.filter((it) => { const s = signature(it); if (seen.has(s)) return false; seen.add(s); return true; });
}

function searchForward(ctx: PlanContext, date: string, sec: number, acc: StopAccess[], egr: StopAccess[]): Itinerary[] {
  const net = ctx.netFor(date);
  const out: Itinerary[] = [];
  let t = sec;
  for (let iter = 0; iter < 12 && out.length < MAX_RESULTS * 2 && t < sec + HORIZON; iter++) {
    const js = raptor(net, acc, egr, t);
    if (!js.length) break;
    out.push(...js.map((j) => toItinerary(net, j)));
    t = Math.min(...js.map((j) => j.firstDepart - j.access.sec)) + 60;
  }
  return dedupe(out).sort((a, b) => a.arrive - b.arrive || b.depart - a.depart).slice(0, MAX_RESULTS);
}

function searchArriveBy(ctx: PlanContext, date: string, target: number, acc: StopAccess[], egr: StopAccess[]): Itinerary[] {
  const net = ctx.netFor(date);
  const cands = new Set<number>();
  for (const a of acc) {
    for (const { p, pos } of net.stopPatterns[a.stop]) {
      for (const tr of net.patterns[p].trips) {
        const d = tr.dep[pos] - a.sec;
        if (d <= target && d >= target - HORIZON) cands.add(d);
      }
    }
  }
  const out: Itinerary[] = [];
  for (const d of [...cands].sort((x, y) => y - x).slice(0, MAX_ARRIVE_BY_RUNS)) {
    for (const j of raptor(net, acc, egr, d)) if (j.arrive <= target) out.push(toItinerary(net, j));
    if (dedupe(out).length >= MAX_RESULTS) break;
  }
  return dedupe(out).sort((a, b) => b.depart - a.depart || a.arrive - b.arrive).slice(0, MAX_RESULTS);
}

/** Seconds since req.date midnight, so itineraries on later days compare correctly. */
export const absTime = (baseDate: string, it: Itinerary, field: 'depart' | 'arrive') => daysBetween(baseDate, it.date) * 86400 + it[field];

export function search(ctx: PlanContext, req: PlanRequest, acc: StopAccess[], egr: StopAccess[], rollover: boolean): Itinerary[] {
  if (!acc.length || !egr.length) return [];
  if (req.mode === 'arr') return searchArriveBy(ctx, req.date, req.sec, acc, egr);
  let r = searchForward(ctx, req.date, req.sec, acc, egr);
  for (let d = 1; rollover && !r.length && d <= ROLLOVER_DAYS; d++) r = searchForward(ctx, addDays(req.date, d), 0, acc, egr);
  return r;
}

function walkItinerary(req: PlanRequest, sec: number, meters: number): Itinerary {
  const start = req.mode === 'dep' ? req.sec : req.sec - sec;
  return {
    date: req.date, depart: start, arrive: start + sec, rides: 0, free: true,
    legs: [{ kind: 'walk', from: req.from, to: req.to, depart: start, arrive: start + sec, meters: Math.round(meters) }],
  };
}

export function planTrip(ctx: PlanContext, req: PlanRequest, bikes: BikeStation[] | null): PlanResult {
  const accW = walkOptions(ctx.stops, req.from, 'access');
  const egrW = walkOptions(ctx.stops, req.to, 'egress');
  const directM = haversine(req.from.lat, req.from.lon, req.to.lat, req.to.lon);
  const wsec = walkSec(directM);
  const walk = wsec <= WALK_ONLY_MAX ? walkItinerary(req, wsec, directM) : null;

  let free = search(ctx, req, accW, egrW, true);
  if (walk) {
    free = req.mode === 'dep'
      ? free.filter((it) => absTime(req.date, it, 'arrive') < walk.arrive)
      : free.filter((it) => absTime(req.date, it, 'depart') > walk.depart);
  }
  const bike = planBike(ctx, req, bikes, free, accW, egrW);
  return { free, bike, walk, nearOrigin: accW.length, nearDest: egrW.length };
}

// Replaced in Task 7.
function planBike(_ctx: PlanContext, _req: PlanRequest, _bikes: BikeStation[] | null, _free: Itinerary[], _accW: StopAccess[], _egrW: StopAccess[]): Itinerary[] {
  return [];
}
```

Note on the walk test: 500 m × 1.3 / 1.25 m/s = 520 s exactly.

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -w app && npm run typecheck -w app`
Expected: all PASS.

- [ ] **Step 5: Commit and push**

```bash
git add -A && git commit -m "feat(router): trip planning with arrive-by, next-day rollover and walk-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 7: Router — Nextbike legs and bike-only option

**Files:**
- Create: `app/src/router/bike.ts`
- Modify: `app/src/router/plan.ts` (replace the `planBike` stub)
- Test: `app/test/bike.test.ts`

**Interfaces:**
- Consumes: `search`, `absTime`, `PlanContext` (Task 6); types (Task 5); shared `BIKE_RENT_SEC`, `BIKE_RETURN_SEC`, `MAX_ACCESS_WALK_M`, `MAX_TRANSFER_WALK_M`, `haversine`, `walkSec`, `bikeSec`.
- Produces:
  ```ts
  interface Chain { sec: number; legs: (start: number) => Leg[] }
  function bikeOnly(from: PlaceRef, to: PlaceRef, stations: BikeStation[]): Chain | null
  function bikeAccessOptions(stops: StopRec[], from: PlaceRef, stations: BikeStation[]): StopAccess[]
  function bikeEgressOptions(stops: StopRec[], to: PlaceRef, stations: BikeStation[]): StopAccess[]
  ```
  `PlanResult.bike` = up to 2 mixed itineraries (each with exactly one bike leg, ≥ 5 min better than the best free one — or any if no free one) sorted by arrival, then the bike-only itinerary if one exists. Mixed searches do not roll over to later days (bike availability is "now").

- [ ] **Step 1: Write failing tests**

`app/test/bike.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { planTrip, type PlanContext } from '../src/router/plan';
import { bikeOnly, bikeAccessOptions } from '../src/router/bike';
import type { BikeStation, PlaceRef } from '../src/router/types';
import { stops, timetable, H } from './fixtures/net';

const ctx: PlanContext = { stops, netFor: (d) => buildNetwork(stops, timetable, d) };
const at = (i: number, northM = 0): PlaceRef => ({ lat: stops[i].lat + northM / 111195, lon: stops[i].lon, name: 'p' + i });
const station = (uid: number, p: PlaceRef, bikes: number): BikeStation => ({ uid, name: 'B' + uid, lat: p.lat, lon: p.lon, bikes, freeRacks: 5 });
const stations = [station(1, at(0, 50), 3), station(2, at(5, -50), 0), station(3, at(2, 30), 2)];

describe('bikeOnly', () => {
  it('walk → ride → walk between the best stations', () => {
    const c = bikeOnly(at(0), at(5), stations)!;
    expect(c).not.toBeNull();
    const legs = c.legs(H(8, 0));
    expect(legs.map((l) => l.kind)).toEqual(['walk', 'bike', 'walk']);
    const b = legs[1];
    expect(b.kind === 'bike' && [b.from.uid, b.to.uid]).toEqual([1, 2]);
    expect(c.sec).toBeGreaterThan(2200);
    expect(c.sec).toBeLessThan(2400);
    expect(legs[2].arrive - H(8, 0)).toBe(c.sec);
  });
  it('needs a pickup station with bikes now', () => {
    expect(bikeOnly(at(0), at(5), [station(1, at(0, 50), 0), station(2, at(5, -50), 4)])).toBeNull();
  });
});

describe('bikeAccessOptions', () => {
  it('reaches stops within 400 m of a drop-off station', () => {
    const opts = bikeAccessOptions(stops, at(0), stations);
    expect(opts.map((o) => o.stop).sort()).toEqual([2, 3, 5]);
  });
});

describe('planTrip with bikes', () => {
  it('always offers bike-only, never marked free; hides mixed trips that are not ≥ 5 min better', () => {
    const r = planTrip(ctx, { from: at(0), to: at(5), mode: 'dep', date: '20261019', sec: H(7, 55) }, stations);
    expect(r.bike.length).toBe(1);
    expect(r.bike[0]).toMatchObject({ rides: 0, free: false });
  });
  it('offers bike + bus when it clearly beats the free option', () => {
    const r = planTrip(ctx, { from: at(0), to: at(5), mode: 'dep', date: '20261019', sec: H(8, 1) }, stations);
    expect(r.free[0].date).toBe('20261020'); // free trips only tomorrow
    const mixed = r.bike.filter((it) => it.rides > 0);
    expect(mixed.some((it) => it.date === '20261019' && it.arrive === H(8, 33))).toBe(true);
    for (const it of r.bike) {
      expect(it.free).toBe(false);
      expect(it.legs.filter((l) => l.kind === 'bike').length).toBe(1);
    }
  });
  it('without bike data returns no bike options', () => {
    expect(planTrip(ctx, { from: at(0), to: at(5), mode: 'dep', date: '20261019', sec: H(7, 55) }, null).bike).toEqual([]);
  });
});
```

Why `[2, 3, 5]`: drop-off station 3 is 30 m from S2 and ~197 m from S3; drop-off station 2 is 50 m from S5. Station 1 is the pickup and cannot be the drop-off.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w app -- bike`
Expected: FAIL — cannot find `../src/router/bike`.

- [ ] **Step 3: Implement bike.ts**

```ts
import {
  BIKE_RENT_SEC, BIKE_RETURN_SEC, MAX_ACCESS_WALK_M, MAX_TRANSFER_WALK_M, bikeSec, haversine, walkSec, type StopRec,
} from '@rb/shared';
import type { BikeStation, Leg, PlaceRef, StopAccess } from './types';

export interface Chain { sec: number; legs: (start: number) => Leg[] }

const placeOf = (s: { lat: number; lon: number; name: string }): PlaceRef => ({ lat: s.lat, lon: s.lon, name: s.name });
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => haversine(a.lat, a.lon, b.lat, b.lon);

function chain(from: PlaceRef, p: BikeStation, d: BikeStation, to: PlaceRef): Chain {
  const m1 = dist(from, p), m2 = dist(p, d), m3 = dist(d, to);
  const w1 = walkSec(m1), ride = BIKE_RENT_SEC + bikeSec(m2) + BIKE_RETURN_SEC, w3 = walkSec(m3);
  return {
    sec: w1 + ride + w3,
    legs: (start) => {
      const out: Leg[] = [];
      let t = start;
      if (m1 >= 1) out.push({ kind: 'walk', from, to: placeOf(p), depart: t, arrive: t + w1, meters: Math.round(m1) });
      t += w1;
      out.push({ kind: 'bike', from: p, to: d, depart: t, arrive: t + ride, meters: Math.round(m2) });
      t += ride;
      if (m3 >= 1) out.push({ kind: 'walk', from: placeOf(d), to, depart: t, arrive: t + w3, meters: Math.round(m3) });
      return out;
    },
  };
}

const pickups = (stations: BikeStation[], near: PlaceRef, maxM: number) => stations.filter((s) => s.bikes > 0 && dist(near, s) <= maxM);
const dropoffs = (stations: BikeStation[], near: PlaceRef, maxM: number) => stations.filter((s) => dist(near, s) <= maxM);

export function bikeOnly(from: PlaceRef, to: PlaceRef, stations: BikeStation[]): Chain | null {
  let best: Chain | null = null;
  for (const p of pickups(stations, from, MAX_ACCESS_WALK_M)) {
    for (const d of dropoffs(stations, to, MAX_ACCESS_WALK_M)) {
      if (d.uid === p.uid) continue;
      const c = chain(from, p, d, to);
      if (!best || c.sec < best.sec) best = c;
    }
  }
  return best;
}

export function bikeAccessOptions(stops: StopRec[], from: PlaceRef, stations: BikeStation[]): StopAccess[] {
  const best = new Map<number, StopAccess>();
  for (const p of pickups(stations, from, MAX_ACCESS_WALK_M)) {
    for (const d of stations) {
      if (d.uid === p.uid) continue;
      stops.forEach((s, i) => {
        if (dist(d, s) > MAX_TRANSFER_WALK_M) return;
        const c = chain(from, p, d, placeOf(s));
        const cur = best.get(i);
        if (!cur || c.sec < cur.sec) best.set(i, { stop: i, sec: c.sec, legs: c.legs });
      });
    }
  }
  return [...best.values()];
}

export function bikeEgressOptions(stops: StopRec[], to: PlaceRef, stations: BikeStation[]): StopAccess[] {
  const best = new Map<number, StopAccess>();
  stops.forEach((s, i) => {
    const sp = placeOf(s);
    for (const p of pickups(stations, sp, MAX_TRANSFER_WALK_M)) {
      for (const d of dropoffs(stations, to, MAX_ACCESS_WALK_M)) {
        if (d.uid === p.uid) continue;
        const c = chain(sp, p, d, to);
        const cur = best.get(i);
        if (!cur || c.sec < cur.sec) best.set(i, { stop: i, sec: c.sec, legs: c.legs });
      }
    }
  });
  return [...best.values()];
}
```

- [ ] **Step 4: Replace the planBike stub in plan.ts**

Add to the imports of `app/src/router/plan.ts`:
```ts
import { bikeAccessOptions, bikeEgressOptions, bikeOnly } from './bike';
```
Replace the stub function (from the `// Replaced in Task 7.` comment to the end of the file) with:
```ts
const BIKE_GAIN = 5 * 60;

function planBike(ctx: PlanContext, req: PlanRequest, bikes: BikeStation[] | null, free: Itinerary[], accW: StopAccess[], egrW: StopAccess[]): Itinerary[] {
  if (!bikes?.length) return [];
  const accB = bikeAccessOptions(ctx.stops, req.from, bikes);
  const egrB = bikeEgressOptions(ctx.stops, req.to, bikes);
  const mixed = [...search(ctx, req, accB, egrW, false), ...search(ctx, req, accW, egrB, false)].filter((it) => !it.free);
  const better = req.mode === 'dep'
    ? (it: Itinerary) => !free.length || absTime(req.date, it, 'arrive') <= Math.min(...free.map((f) => absTime(req.date, f, 'arrive'))) - BIKE_GAIN
    : (it: Itinerary) => !free.length || absTime(req.date, it, 'depart') >= Math.max(...free.map((f) => absTime(req.date, f, 'depart'))) + BIKE_GAIN;
  const out = dedupe(mixed.filter(better)).sort((a, b) => a.arrive - b.arrive).slice(0, 2);
  const only = bikeOnly(req.from, req.to, bikes);
  if (only) {
    const start = req.mode === 'dep' ? req.sec : req.sec - only.sec;
    out.push({ date: req.date, depart: start, arrive: start + only.sec, rides: 0, free: false, legs: only.legs(start) });
  }
  return out;
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -w app && npm run typecheck -w app`
Expected: all PASS (Task 6 tests still pass).

- [ ] **Step 6: Commit and push**

```bash
git add -A && git commit -m "feat(router): Nextbike first/last-leg trips and bike-only option

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 8: Router — live-delay overlay, stop departures, stop timetables

**Files:**
- Create: `app/src/router/delays.ts`, `app/src/router/departures.ts`, `app/src/router/timetable.ts`
- Test: `app/test/delays.test.ts`, `app/test/departures.test.ts`

**Interfaces:**
- Consumes: `DelaysResponse`, `TripDelay`, `TimetableFile`, `FreeRouteId`, `weekday`, `MIN_TRANSFER_SEC` (shared); `Network` (Task 5); `Itinerary` (Task 5).
- Produces:
  ```ts
  // delays.ts
  function delayAt(rec: TripDelay, seq: number): number
  function tripDelay(d: DelaysResponse | null, tripId: string, serviceDate: string, seq: number): number | null
  interface LiveOverlay { boardDelay: (number | null)[]; alightDelay: (number | null)[]; transferRisk: boolean[] } // indexed by leg
  function overlayDelays(it: Itinerary, d: DelaysResponse | null): LiveOverlay
  // departures.ts
  interface Departure { p: number; pos: number; tripId: string; serviceDate: string; routeId: FreeRouteId; headsign: string; dep: number; seq: number }
  function departuresAt(net: Network, stop: number, fromSec: number, limit: number): Departure[]
  // timetable.ts
  type DayType = 'weekday' | 'saturday' | 'sunday'
  function dayTypeOf(date: string): DayType
  function sampleDate(tt: TimetableFile, dayType: DayType, from: string): string | null
  function stopTimetable(tt: TimetableFile, routeId: FreeRouteId, directionId: number, stop: number, date: string): Map<number, number[]> // hour → minutes
  ```

- [ ] **Step 1: Write failing tests**

`app/test/delays.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { DelaysResponse } from '@rb/shared';
import { delayAt, tripDelay, overlayDelays } from '../src/router/delays';
import type { Itinerary } from '../src/router/types';
import { H } from './fixtures/net';

const resp = (trips: DelaysResponse['trips']): DelaysResponse => ({ generatedAt: 1, trips });

describe('tripDelay', () => {
  const d = resp({ a1: { startDate: '20261019', delay: 30, stops: { 1: 60, 3: 120 } } });
  it('uses the exact stop sequence, else the nearest earlier one, else the trip delay', () => {
    expect(tripDelay(d, 'a1', '20261019', 3)).toBe(120);
    expect(tripDelay(d, 'a1', '20261019', 2)).toBe(60);
    expect(delayAt({ startDate: '', delay: 30, stops: { 5: 10 } }, 2)).toBe(30);
  });
  it('ignores delays from a different start date', () => {
    expect(tripDelay(d, 'a1', '20261018', 3)).toBeNull();
  });
  it('returns null without data', () => {
    expect(tripDelay(null, 'a1', '20261019', 1)).toBeNull();
    expect(tripDelay(d, 'zz', '20261019', 1)).toBeNull();
  });
});

describe('overlayDelays', () => {
  const it0: Itinerary = {
    date: '20261019', depart: H(8, 0), arrive: H(8, 21), rides: 2, free: true,
    legs: [
      { kind: 'bus', routeId: 'L1731', headsign: 'S2', tripId: 'a1', serviceDate: '20261019', pattern: 0, boardPos: 0, alightPos: 2, boardSeq: 1, alightSeq: 3, from: 0, to: 2, depart: H(8, 0), arrive: H(8, 10), stopCount: 2 },
      { kind: 'walk', from: { lat: 0, lon: 0, name: 'S2' }, to: { lat: 0, lon: 0, name: 'S3' }, depart: H(8, 10), arrive: H(8, 10) + 174, meters: 167 },
      { kind: 'bus', routeId: 'L1733', headsign: 'S4', tripId: 'b1', serviceDate: '20261019', pattern: 1, boardPos: 0, alightPos: 1, boardSeq: 1, alightSeq: 2, from: 3, to: 4, depart: H(8, 15), arrive: H(8, 21), stopCount: 1 },
    ],
  };
  it('flags a transfer at risk when the incoming bus is late', () => {
    const o = overlayDelays(it0, resp({ a1: { startDate: '20261019', delay: 150, stops: { 3: 150 } } }));
    expect(o.alightDelay[0]).toBe(150);
    expect(o.boardDelay[2]).toBeNull();
    expect(o.transferRisk).toEqual([false, false, true]);
  });
  it('no risk when on time or when there is no live data', () => {
    expect(overlayDelays(it0, resp({ a1: { startDate: '20261019', delay: 0, stops: {} } })).transferRisk).toEqual([false, false, false]);
    expect(overlayDelays(it0, null).transferRisk).toEqual([false, false, false]);
  });
});
```

`app/test/departures.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { departuresAt } from '../src/router/departures';
import { stopTimetable, sampleDate, dayTypeOf } from '../src/router/timetable';
import { stops, timetable, H } from './fixtures/net';

const net = buildNetwork(stops, timetable, '20261019');

describe('departuresAt', () => {
  it('lists upcoming departures, excluding trips that end at this stop', () => {
    const d = departuresAt(net, 2, H(8, 0), 5);
    expect(d.map((x) => [x.tripId, x.dep, x.routeId])).toEqual([['c1', H(8, 10, 30), 'L1732'], ['c2', H(8, 25), 'L1732']]);
    expect(d[0]).toMatchObject({ seq: 1, headsign: 'S5', serviceDate: '20261019' });
  });
  it('respects the limit and the start time', () => {
    expect(departuresAt(net, 0, H(8, 0), 2).map((x) => x.dep)).toEqual([H(8, 0), H(8, 0)]);
    expect(departuresAt(net, 0, H(8, 1), 5).map((x) => x.tripId)).toEqual(['a2']);
  });
});

describe('timetable', () => {
  it('stopTimetable groups departures by hour', () => {
    expect([...stopTimetable(timetable, 'L1731', 0, 0, '20261019')]).toEqual([[8, [0, 30]]]);
    expect([...stopTimetable(timetable, 'L1731', 0, 0, '20261018')]).toEqual([]);
  });
  it('sampleDate picks the first matching day type in the data window', () => {
    expect(sampleDate(timetable, 'weekday', '20261018')).toBe('20261019');
    expect(sampleDate(timetable, 'sunday', '20261001')).toBe('20261018');
    expect(sampleDate(timetable, 'saturday', '20261001')).toBeNull();
  });
  it('dayTypeOf', () => {
    expect(dayTypeOf('20261019')).toBe('weekday');
    expect(dayTypeOf('20261017')).toBe('saturday');
    expect(dayTypeOf('20261018')).toBe('sunday');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w app -- delays departures`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`app/src/router/delays.ts`:
```ts
import { MIN_TRANSFER_SEC, type DelaysResponse, type TripDelay } from '@rb/shared';
import type { Itinerary } from './types';

export function delayAt(rec: TripDelay, seq: number): number {
  if (rec.stops[seq] != null) return rec.stops[seq];
  let bestSeq = -1;
  for (const k of Object.keys(rec.stops)) {
    const n = Number(k);
    if (n <= seq && n > bestSeq) bestSeq = n;
  }
  return bestSeq >= 0 ? rec.stops[bestSeq] : rec.delay;
}

export function tripDelay(d: DelaysResponse | null, tripId: string, serviceDate: string, seq: number): number | null {
  const r = d?.trips[tripId];
  if (!r || (r.startDate && r.startDate !== serviceDate)) return null;
  return delayAt(r, seq);
}

export interface LiveOverlay { boardDelay: (number | null)[]; alightDelay: (number | null)[]; transferRisk: boolean[] }

export function overlayDelays(it: Itinerary, d: DelaysResponse | null): LiveOverlay {
  const n = it.legs.length;
  const o: LiveOverlay = { boardDelay: Array(n).fill(null), alightDelay: Array(n).fill(null), transferRisk: Array(n).fill(false) };
  it.legs.forEach((l, i) => {
    if (l.kind !== 'bus') return;
    o.boardDelay[i] = tripDelay(d, l.tripId, l.serviceDate, l.boardSeq);
    o.alightDelay[i] = tripDelay(d, l.tripId, l.serviceDate, l.alightSeq);
  });
  for (let i = 0; i < n; i++) {
    const a = it.legs[i];
    if (a.kind !== 'bus') continue;
    let walk = 0;
    for (let j = i + 1; j < n; j++) {
      const b = it.legs[j];
      if (b.kind === 'walk') { walk += b.arrive - b.depart; continue; }
      if (b.kind === 'bus') {
        const ad = o.alightDelay[i] ?? 0, bd = o.boardDelay[j] ?? 0;
        const margin = b.depart + bd - (a.arrive + ad) - walk;
        o.transferRisk[j] = ad - bd > 0 && margin < MIN_TRANSFER_SEC;
      }
      break;
    }
  }
  return o;
}
```

`app/src/router/departures.ts`:
```ts
import type { FreeRouteId } from '@rb/shared';
import type { Network } from './network';

export interface Departure { p: number; pos: number; tripId: string; serviceDate: string; routeId: FreeRouteId; headsign: string; dep: number; seq: number }

export function departuresAt(net: Network, stop: number, fromSec: number, limit: number): Departure[] {
  const out: Departure[] = [];
  for (const { p, pos } of net.stopPatterns[stop]) {
    const pat = net.patterns[p];
    if (pos === pat.stops.length - 1) continue;
    for (const t of pat.trips) {
      if (t.dep[pos] >= fromSec) {
        out.push({ p, pos, tripId: t.id, serviceDate: t.serviceDate, routeId: pat.routeId, headsign: pat.headsign, dep: t.dep[pos], seq: pat.seq[pos] });
      }
    }
  }
  return out.sort((a, b) => a.dep - b.dep).slice(0, limit);
}
```

`app/src/router/timetable.ts`:
```ts
import { weekday, type FreeRouteId, type TimetableFile } from '@rb/shared';

export type DayType = 'weekday' | 'saturday' | 'sunday';

export const dayTypeOf = (date: string): DayType => {
  const w = weekday(date);
  return w <= 4 ? 'weekday' : w === 5 ? 'saturday' : 'sunday';
};

export function sampleDate(tt: TimetableFile, dayType: DayType, from: string): string | null {
  return Object.keys(tt.servicesByDate).sort().find((d) => d >= from && dayTypeOf(d) === dayType) ?? null;
}

export function stopTimetable(tt: TimetableFile, routeId: FreeRouteId, directionId: number, stop: number, date: string): Map<number, number[]> {
  const active = new Set(tt.servicesByDate[date] ?? []);
  const times: number[] = [];
  for (const p of tt.patterns) {
    if (p.routeId !== routeId || p.directionId !== directionId) continue;
    p.stops.forEach((s, pos) => {
      if (s !== stop || pos === p.stops.length - 1) return;
      for (const t of p.trips) if (active.has(t.service)) times.push(t.dep[pos]);
    });
  }
  const out = new Map<number, number[]>();
  for (const t of [...new Set(times)].sort((a, b) => a - b)) {
    const h = Math.floor(t / 3600) % 24;
    const m = Math.floor((t % 3600) / 60);
    if (!out.has(h)) out.set(h, []);
    out.get(h)!.push(m);
  }
  return out;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -w app && npm run typecheck -w app`
Expected: all PASS.

- [ ] **Step 5: Commit and push**

```bash
git add -A && git commit -m "feat(router): live-delay overlay with transfer risk, departures, stop timetables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 9: Golden tests on real Říčany data (independent brute-force oracle + speed)

**Files:**
- Test: `app/test/golden.test.ts`

**Interfaces:**
- Consumes: `app/public/data/{stops,timetable}.json` (Task 3), `buildNetwork`, `raptor`, `planTrip`, `weekday`, `MIN_TRANSFER_SEC`.
- Produces: nothing new — this guards the router against the real network.

- [ ] **Step 1: Write the test**

`app/test/golden.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MIN_TRANSFER_SEC, weekday, type StopsFile, type TimetableFile } from '@rb/shared';
import { buildNetwork, type Network } from '../src/router/network';
import { raptor } from '../src/router/raptor';
import { planTrip } from '../src/router/plan';

const load = <T>(n: string): T => JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), 'utf8'));
const { stops } = load<StopsFile>('stops');
const tt = load<TimetableFile>('timetable');
const date = Object.keys(tt.servicesByDate).sort().find((d) => weekday(d) <= 4 && tt.servicesByDate[d].length)!;
const net = buildNetwork(stops, tt, date);

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Earliest arrival using ≤ 2 rides, enumerating every trip combination. Independent of RAPTOR. */
function brute(n: Network, from: number, to: number, t0: number): number {
  let best = Infinity;
  const rides = (stop: number, ready: number, cb: (s: number, arr: number) => void) => {
    for (const { p, pos } of n.stopPatterns[stop]) {
      const pat = n.patterns[p];
      for (const tr of pat.trips) {
        if (tr.dep[pos] < ready) continue;
        for (let j = pos + 1; j < pat.stops.length; j++) cb(pat.stops[j], tr.arr[j]);
      }
    }
  };
  const reach = (s: number, a: number) => {
    if (s === to) best = Math.min(best, a);
    for (const [t2, w] of n.stops[s].transfers) if (t2 === to) best = Math.min(best, a + w);
  };
  rides(from, t0, (s1, a1) => {
    reach(s1, a1);
    const next: [number, number][] = [[s1, a1 + MIN_TRANSFER_SEC], ...n.stops[s1].transfers.map(([s2, w]) => [s2, a1 + w] as [number, number])];
    for (const [s2, r2] of next) rides(s2, r2, (s3, a3) => reach(s3, a3));
  });
  return best;
}

describe(`golden: real data on ${date}`, () => {
  it('RAPTOR (≤ 2 rides) matches brute force on 40 random stop pairs', () => {
    const r = rng(42);
    let compared = 0;
    for (let i = 0; i < 40; i++) {
      const from = Math.floor(r() * stops.length);
      const to = Math.floor(r() * stops.length);
      if (from === to) continue;
      const t0 = 6 * 3600 + Math.floor(r() * 12 * 3600);
      const js = raptor(net, [{ stop: from, sec: 0 }], [{ stop: to, sec: 0 }], t0, 2);
      const got = js.length ? Math.min(...js.map((j) => j.arrive)) : Infinity;
      expect(got, `${stops[from].name} → ${stops[to].name} @ ${t0}`).toBe(brute(net, from, to, t0));
      compared++;
    }
    expect(compared).toBeGreaterThan(30);
  });

  it('planTrip averages < 100 ms on real data', () => {
    const r = rng(7);
    const ctx = { stops, netFor: (d: string) => (d === date ? net : buildNetwork(stops, tt, d)) };
    const t = performance.now();
    for (let i = 0; i < 20; i++) {
      const a = stops[Math.floor(r() * stops.length)], b = stops[Math.floor(r() * stops.length)];
      planTrip(ctx, { from: { lat: a.lat, lon: a.lon, name: 'a' }, to: { lat: b.lat, lon: b.lon, name: 'b' }, mode: 'dep', date, sec: 7 * 3600 + i * 600 }, null);
    }
    expect((performance.now() - t) / 20).toBeLessThan(100);
  });

  it('every free line appears in the data and only free route_ids exist', () => {
    const ids = new Set(tt.patterns.map((p) => p.routeId));
    expect([...ids].sort()).toEqual(['L1731', 'L1732', 'L1733', 'L1734', 'L1735', 'L1736', 'L1737']);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -w app -- golden`
Expected: PASS. If the oracle disagrees, the message names the stop pair and time: debug RAPTOR (superpowers:systematic-debugging) — the brute force is the reference. Only change the oracle if you can show by hand from `timetable.json` that the oracle is wrong.

- [ ] **Step 3: Commit and push**

```bash
git add -A && git commit -m "test(router): brute-force oracle and speed check on real Říčany data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 10: App shell — Svelte/Vite/PWA, i18n, hash routes, storage, bottom sheet, Pages deploy + nightly refresh

**Files:**
- Modify: `app/package.json` (scripts, deps), `app/tsconfig.json`
- Create: `app/index.html`, `app/vite.config.ts`, `app/svelte.config.js`, `app/src/main.ts`, `app/src/app.css`, `app/src/config.ts`, `app/src/App.svelte`
- Create: `app/src/lib/{storage,i18n,hashRoute,nav,data,network,ui}.ts`, `app/src/components/BottomSheet.svelte`
- Create: `app/public/icons/icon.svg` (+ generated PNGs)
- Create: `.github/workflows/deploy.yml`, `.github/workflows/refresh-data.yml`
- Test: `app/test/{storage,i18n,hashRoute}.test.ts`

**Interfaces:**
- Consumes: shared types; `buildNetwork`, `Network` (Task 5); `PlaceRef`, `Itinerary` (Task 5).
- Produces:
  ```ts
  // config.ts
  const WORKER_URL: string; const NEXTBIKE_URL: string; const PHOTON_URL: string; const MAP_STYLE: string; const DATA_BASE: string
  // storage.ts
  function load<T>(key: string, fallback: T): T;  function save(key: string, value: unknown): void
  // i18n.ts
  type Lang = 'cs' | 'en'; type Key = keyof typeof dict.cs
  const dict: { cs: Record<Key,string>; en: Record<Key,string> }
  const lang: Writable<Lang>;  const t: Readable<(key: Key, vars?: Record<string, string | number>) => string>
  // hashRoute.ts
  type PlanMode = 'now' | 'dep' | 'arr'
  type Route = { name: 'home' } | { name: 'plan'; from?: PlaceRef; to?: PlaceRef; mode: PlanMode; date?: string; time?: string; sel?: string }
             | { name: 'stop'; stopId: string } | { name: 'line'; number: string; dir: number; stopId?: string } | { name: 'bike'; uid: number }
  function parseHash(hash: string): Route;  function formatRoute(r: Route): string
  // nav.ts
  const route: Readable<Route>;  function navigate(r: Route, replace?: boolean): void
  // data.ts
  interface AppData { stops: StopRec[]; lines: LineRec[]; timetable: TimetableFile; meta: MetaFile }
  function loadData(): Promise<AppData>;  function daysLeft(meta: MetaFile, today: string): number
  // network.ts
  function netFor(data: AppData, date: string): Network   // memoized per date
  // ui.ts (shared UI state between map and sheets)
  const bikesLayerOn: Writable<boolean>; const pickTarget: Writable<'from' | 'to' | 'add' | null>;
  const mapPick: Writable<{ lat: number; lon: number } | null>; const tripOverlay: Writable<Itinerary | null>;
  const highlightLine: Writable<FreeRouteId | null>; const focusPoints: Writable<[number, number][] | null>;
  const userPos: Writable<{ lat: number; lon: number } | null>; const planMarkers: Writable<{ from?: PlaceRef; to?: PlaceRef }>;
  const now: Readable<{ date: string; sec: number }>   // ticks every 30 s
  ```
  `App.svelte` contains marker comments `<!-- MAP -->`, `<!-- SHEET:home -->`, `<!-- SHEET:plan -->`, `<!-- SHEET:stop -->`, `<!-- SHEET:line -->`, `<!-- SHEET:bike -->` that later tasks replace.

- [ ] **Step 1: Install app dependencies**

```bash
npm i -w app svelte maplibre-gl
npm i -D -w app vite @sveltejs/vite-plugin-svelte svelte-check vite-plugin-pwa @playwright/test
```
If npm reports a peer-dependency conflict between `vite` and `@sveltejs/vite-plugin-svelte` or `vite-plugin-pwa`, install the newest `vite` major that all three accept (`npm view @sveltejs/vite-plugin-svelte peerDependencies`), e.g. `npm i -D -w app vite@6`. Never use `--force`/`--legacy-peer-deps`.

`app/package.json` scripts become:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview --port 4173 --strictPort",
  "test": "vitest run",
  "typecheck": "svelte-check --tsconfig ./tsconfig.json --threshold error",
  "e2e": "playwright test"
}
```
`app/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node", "vite/client"], "verbatimModuleSyntax": true },
  "include": ["src/**/*.ts", "src/**/*.svelte", "test/**/*.ts", "e2e/**/*.ts", "*.ts"]
}
```

- [ ] **Step 2: Write failing tests**

`app/test/storage.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { load, save } from '../src/lib/storage';

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('storage', () => {
  it('round-trips JSON through localStorage', () => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    save('k', { a: 1 });
    expect(load('k', null)).toEqual({ a: 1 });
    expect(load('missing', 7)).toBe(7);
  });
  it('falls back when storage is unavailable or throws', () => {
    expect(load('k', 'fb')).toBe('fb');
    expect(() => save('k', 1)).not.toThrow();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(load('k', 'fb')).toBe('fb');
    expect(() => save('k', 1)).not.toThrow();
  });
  it('falls back on corrupt JSON', () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => '{not json', setItem: () => {} };
    expect(load('k', [])).toEqual([]);
  });
});
```

`app/test/i18n.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { dict, lang, t } from '../src/lib/i18n';

describe('i18n', () => {
  it('cs and en have identical keys and no empty strings', () => {
    expect(Object.keys(dict.en).sort()).toEqual(Object.keys(dict.cs).sort());
    for (const l of ['cs', 'en'] as const) for (const v of Object.values(dict[l])) expect(v.length).toBeGreaterThan(0);
  });
  it('defaults to Czech and interpolates variables', () => {
    expect(get(lang)).toBe('cs');
    expect(get(t)('whereTo')).toBe('Kam jedete?');
    expect(get(t)('inMin', { n: 4 })).toBe('za 4 min');
    lang.set('en');
    expect(get(t)('whereTo')).toBe('Where to?');
    lang.set('cs');
  });
});
```

`app/test/hashRoute.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseHash, formatRoute, type Route } from '../src/lib/hashRoute';

const rt = (r: Route) => expect(parseHash(formatRoute(r))).toEqual(r);

describe('hashRoute', () => {
  it('round-trips every route', () => {
    rt({ name: 'home' });
    rt({ name: 'plan', mode: 'arr', from: { lat: 49.991833, lon: 14.655608, name: 'Domů, u lesa' }, to: { lat: 50.0, lon: 14.66, name: 'Škola' }, date: '20261019', time: '07:45', sel: 'f1' });
    rt({ name: 'plan', mode: 'now', from: undefined, to: undefined, date: undefined, time: undefined, sel: undefined });
    rt({ name: 'stop', stopId: 'U9364Z11' });
    rt({ name: 'line', number: '91', dir: 1, stopId: 'U6790Z1' });
    rt({ name: 'bike', uid: 27581951 });
  });
  it('falls back to home or defaults on garbage', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/whatever')).toEqual({ name: 'home' });
    expect(parseHash('#/stop/')).toEqual({ name: 'home' });
    expect(parseHash('#/bike/abc')).toEqual({ name: 'home' });
    expect(parseHash('#/plan?mode=xyz&from=a,b,c')).toMatchObject({ name: 'plan', mode: 'now', from: undefined });
    expect(parseHash('#/line/3')).toEqual({ name: 'line', number: '3', dir: 0, stopId: undefined });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -w app -- storage i18n hashRoute`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement lib modules**

`app/src/config.ts`:
```ts
export const WORKER_URL = 'https://ricany-bus-live.pokeypoke.workers.dev';
export const NEXTBIKE_URL = 'https://api.nextbike.net/maps/nextbike-live.json?city=736';
export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
```

`app/src/lib/storage.ts`:
```ts
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota, disabled) — the app keeps working without persistence
  }
}
```

`app/src/lib/i18n.ts`:
```ts
import { derived, writable } from 'svelte/store';
import { load, save } from './storage';

const cs = {
  appName: 'Říčany zdarma',
  whereTo: 'Kam jedete?',
  from: 'Odkud',
  to: 'Kam',
  searchPlaceholder: 'Adresa, místo nebo zastávka',
  myLocation: 'Moje poloha',
  pickOnMap: 'Vybrat na mapě',
  pointOnMap: 'Bod na mapě',
  tapMapHint: 'Klepněte do mapy na požadované místo',
  departNow: 'Teď',
  departAt: 'Odjezd',
  arriveBy: 'Příjezd',
  swap: 'Prohodit',
  free: 'Zdarma',
  withBike: 'S Nextbike (placené)',
  walkOnly: 'Pěšky',
  paid: 'placené',
  bikesNow: 'kola k dispozici teď: {n}',
  noFreeRoute: 'Žádné spojení zdarma',
  earlier: 'Dříve',
  later: 'Později',
  noStopsOrigin: 'Do 1,2 km od výchozího místa není žádná zastávka linek zdarma.',
  noStopsDest: 'Do 1,2 km od cíle není žádná zastávka linek zdarma.',
  minutes: '{n} min',
  walkFor: 'Pěšky {n} min · {m} m',
  bikeFor: 'Nextbike {n} min · {m} m',
  rides: '{n}× bus',
  toward: 'směr {h}',
  stopsCount: '{n} zast.',
  transferRisk: 'Přestup může ujet',
  noLive: 'bez živých dat',
  staleData: 'Jízdní řády mohou být neaktuální',
  offline: 'Jste offline — jízdní řády fungují, živá data ne',
  departures: 'Odjezdy',
  noMoreToday: 'Dnes už odsud nic nejede',
  tomorrow: 'zítra',
  inMin: 'za {n} min',
  nowShort: 'teď',
  lines: 'Linky',
  weekday: 'Po–Pá',
  saturday: 'So',
  sunday: 'Ne',
  noService: 'V tento den linka nejede',
  myPlaces: 'Moje místa',
  addPlace: 'Přidat místo',
  placeName: 'Název',
  save: 'Uložit',
  cancel: 'Zrušit',
  edit: 'Upravit',
  done: 'Hotovo',
  remove: 'Odebrat',
  homePlace: 'Domů',
  workPlace: 'Práce',
  schoolPlace: 'Škola',
  recent: 'Nedávné',
  bikes: 'Nextbike',
  bikesAvailable: 'Kola: {n}',
  freeRacks: 'Volná místa: {n}',
  updatedAt: 'Aktualizováno {t}',
  openNextbike: 'Otevřít Nextbike',
  bikeUnavailable: 'Data Nextbike teď nejsou dostupná',
  nearestBike: 'Nejbližší Nextbike',
  planFromHere: 'Jet odsud',
  planToHere: 'Jet sem',
  geocodeFailed: 'Vyhledávání adres teď nefunguje — vyberte zastávku nebo místo na mapě.',
  locationDenied: 'Přístup k poloze je zakázán. Povolte ho v nastavení prohlížeče.',
  locationUnavailable: 'Polohu se nepodařilo zjistit.',
  loading: 'Načítám…',
  loadFailed: 'Data se nepodařilo načíst.',
  retry: 'Zkusit znovu',
  back: 'Zpět',
  planning: 'Hledám spojení…',
  attribution: 'Data: ROPID/PID · © přispěvatelé OpenStreetMap · Photon · Nextbike',
  langToggle: 'English',
  layerBikes: 'Zobrazit stanice Nextbike',
  resize: 'Změnit velikost panelu',
  stopNotFound: 'Zastávka nenalezena',
  lineNotFound: 'Linka nenalezena',
  stationNotFound: 'Stanice nenalezena',
  locate: 'Moje poloha na mapě',
} as const;

type Key = keyof typeof cs;

const en: Record<Key, string> = {
  appName: 'Říčany free bus',
  whereTo: 'Where to?',
  from: 'From',
  to: 'To',
  searchPlaceholder: 'Address, place or stop',
  myLocation: 'My location',
  pickOnMap: 'Pick on map',
  pointOnMap: 'Point on map',
  tapMapHint: 'Tap the map at the place you want',
  departNow: 'Now',
  departAt: 'Depart',
  arriveBy: 'Arrive',
  swap: 'Swap',
  free: 'Free',
  withBike: 'With Nextbike (paid)',
  walkOnly: 'Walk',
  paid: 'paid',
  bikesNow: 'bikes available now: {n}',
  noFreeRoute: 'No free connection',
  earlier: 'Earlier',
  later: 'Later',
  noStopsOrigin: 'No free-line stop within 1.2 km of the start.',
  noStopsDest: 'No free-line stop within 1.2 km of the destination.',
  minutes: '{n} min',
  walkFor: 'Walk {n} min · {m} m',
  bikeFor: 'Nextbike {n} min · {m} m',
  rides: '{n}× bus',
  toward: 'towards {h}',
  stopsCount: '{n} stops',
  transferRisk: 'Connection at risk',
  noLive: 'no live data',
  staleData: 'Timetables may be out of date',
  offline: 'You are offline — timetables work, live data does not',
  departures: 'Departures',
  noMoreToday: 'No more departures today',
  tomorrow: 'tomorrow',
  inMin: 'in {n} min',
  nowShort: 'now',
  lines: 'Lines',
  weekday: 'Mon–Fri',
  saturday: 'Sat',
  sunday: 'Sun',
  noService: 'The line does not run on this day',
  myPlaces: 'My places',
  addPlace: 'Add place',
  placeName: 'Name',
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  done: 'Done',
  remove: 'Remove',
  homePlace: 'Home',
  workPlace: 'Work',
  schoolPlace: 'School',
  recent: 'Recent',
  bikes: 'Nextbike',
  bikesAvailable: 'Bikes: {n}',
  freeRacks: 'Free docks: {n}',
  updatedAt: 'Updated {t}',
  openNextbike: 'Open Nextbike',
  bikeUnavailable: 'Nextbike data is unavailable right now',
  nearestBike: 'Nearest Nextbike',
  planFromHere: 'From here',
  planToHere: 'To here',
  geocodeFailed: 'Address search is not working right now — pick a stop or a point on the map.',
  locationDenied: 'Location access is blocked. Allow it in your browser settings.',
  locationUnavailable: 'Could not determine your location.',
  loading: 'Loading…',
  loadFailed: 'Could not load data.',
  retry: 'Try again',
  back: 'Back',
  planning: 'Finding connections…',
  attribution: 'Data: ROPID/PID · © OpenStreetMap contributors · Photon · Nextbike',
  langToggle: 'Čeština',
  layerBikes: 'Show Nextbike stations',
  resize: 'Resize panel',
  stopNotFound: 'Stop not found',
  lineNotFound: 'Line not found',
  stationNotFound: 'Station not found',
  locate: 'Show my location',
};

export type Lang = 'cs' | 'en';
export const dict: Record<Lang, Record<Key, string>> = { cs, en };

export const lang = writable<Lang>(load<Lang>('rb.lang', 'cs') === 'en' ? 'en' : 'cs');
lang.subscribe((v) => {
  save('rb.lang', v);
  if (typeof document !== 'undefined') document.documentElement.lang = v;
});

export const t = derived(lang, (l) => (key: Key, vars?: Record<string, string | number>) => {
  let s: string = dict[l][key] ?? dict.cs[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
});
```
Note the `en` dictionary labels the toggle "Čeština" (when in English, the button offers Czech) and `cs` labels it "English".

`app/src/lib/hashRoute.ts`:
```ts
import type { PlaceRef } from '../router/types';
export type { PlaceRef };

export type PlanMode = 'now' | 'dep' | 'arr';
export type Route =
  | { name: 'home' }
  | { name: 'plan'; from?: PlaceRef; to?: PlaceRef; mode: PlanMode; date?: string; time?: string; sel?: string }
  | { name: 'stop'; stopId: string }
  | { name: 'line'; number: string; dir: number; stopId?: string }
  | { name: 'bike'; uid: number };

const encPlace = (p: PlaceRef) => `${+p.lat.toFixed(6)},${+p.lon.toFixed(6)},${p.name}`;
function decPlace(s: string | null): PlaceRef | undefined {
  if (!s) return undefined;
  const [lat, lon, ...rest] = s.split(',');
  const p = { lat: Number(lat), lon: Number(lon), name: rest.join(',') };
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && lat !== '' && lon !== '' ? p : undefined;
}
const opt = (v: string | null) => v ?? undefined;

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const q = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'plan': {
      const m = q.get('mode');
      const mode: PlanMode = m === 'dep' || m === 'arr' ? m : 'now';
      return { name: 'plan', mode, from: decPlace(q.get('from')), to: decPlace(q.get('to')), date: opt(q.get('d')), time: opt(q.get('t')), sel: opt(q.get('sel')) };
    }
    case 'stop':
      return parts[1] ? { name: 'stop', stopId: parts[1] } : { name: 'home' };
    case 'line':
      return parts[1] ? { name: 'line', number: parts[1], dir: Number(q.get('dir')) || 0, stopId: opt(q.get('stop')) } : { name: 'home' };
    case 'bike': {
      const uid = Number(parts[1]);
      return parts[1] && Number.isFinite(uid) ? { name: 'bike', uid } : { name: 'home' };
    }
    default:
      return { name: 'home' };
  }
}

export function formatRoute(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'plan': {
      const q = new URLSearchParams();
      if (r.from) q.set('from', encPlace(r.from));
      if (r.to) q.set('to', encPlace(r.to));
      q.set('mode', r.mode);
      if (r.date) q.set('d', r.date);
      if (r.time) q.set('t', r.time);
      if (r.sel) q.set('sel', r.sel);
      return `#/plan?${q}`;
    }
    case 'stop':
      return `#/stop/${encodeURIComponent(r.stopId)}`;
    case 'line': {
      const q = new URLSearchParams({ dir: String(r.dir) });
      if (r.stopId) q.set('stop', r.stopId);
      return `#/line/${encodeURIComponent(r.number)}?${q}`;
    }
    case 'bike':
      return `#/bike/${r.uid}`;
  }
}
```

`app/src/lib/nav.ts`:
```ts
import { writable } from 'svelte/store';
import { formatRoute, parseHash, type Route } from './hashRoute';

const store = writable<Route>(parseHash(location.hash));
addEventListener('hashchange', () => store.set(parseHash(location.hash)));

export const route = { subscribe: store.subscribe };

export function navigate(r: Route, replace = false): void {
  const h = formatRoute(r);
  if (replace) {
    history.replaceState(history.state, '', h);
    store.set(parseHash(h));
  } else if (location.hash !== h) {
    location.hash = h;
  }
}
```

`app/src/lib/data.ts`:
```ts
import { daysBetween, type LineRec, type LinesFile, type MetaFile, type StopRec, type StopsFile, type TimetableFile } from '@rb/shared';
import { DATA_BASE } from '../config';

export interface AppData { stops: StopRec[]; lines: LineRec[]; timetable: TimetableFile; meta: MetaFile }

async function get<T>(name: string): Promise<T> {
  const r = await fetch(`${DATA_BASE}${name}.json`);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function loadData(): Promise<AppData> {
  const [s, l, timetable, meta] = await Promise.all([get<StopsFile>('stops'), get<LinesFile>('lines'), get<TimetableFile>('timetable'), get<MetaFile>('meta')]);
  return { stops: s.stops, lines: l.lines, timetable, meta };
}

export const daysLeft = (meta: MetaFile, today: string) => daysBetween(today, meta.feedEnd);
```

`app/src/lib/network.ts`:
```ts
import { buildNetwork, type Network } from '../router/network';
import type { AppData } from './data';

const cache = new Map<string, Network>();
export function netFor(data: AppData, date: string): Network {
  let n = cache.get(date);
  if (!n) { n = buildNetwork(data.stops, data.timetable, date); cache.set(date, n); }
  return n;
}
```

`app/src/lib/ui.ts`:
```ts
import { readable, writable } from 'svelte/store';
import { pragueNow, type FreeRouteId } from '@rb/shared';
import type { Itinerary, PlaceRef } from '../router/types';

export const bikesLayerOn = writable(true);
export const pickTarget = writable<'from' | 'to' | 'add' | null>(null);
export const mapPick = writable<{ lat: number; lon: number } | null>(null);
export const tripOverlay = writable<Itinerary | null>(null);
export const highlightLine = writable<FreeRouteId | null>(null);
export const focusPoints = writable<[number, number][] | null>(null);
export const userPos = writable<{ lat: number; lon: number } | null>(null);
export const planMarkers = writable<{ from?: PlaceRef; to?: PlaceRef }>({});
export const now = readable(pragueNow(), (set) => {
  const i = setInterval(() => set(pragueNow()), 30_000);
  return () => clearInterval(i);
});
```

- [ ] **Step 5: Run unit tests**

Run: `npm test -w app`
Expected: all PASS (router tests + 3 new files).

- [ ] **Step 6: Vite, Svelte, PWA, HTML, styles**

`app/svelte.config.js`:
```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess() };
```

`app/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ricany-bus/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*'],
      manifest: {
        name: 'Říčany zdarma — MHD',
        short_name: 'Říčany MHD',
        description: 'Spojení jen bezplatnými autobusy MHD Říčany a Nextbike',
        lang: 'cs',
        theme_color: '#0b5cad',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/ricany-bus/',
        scope: '/ricany-bus/',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.includes('/data/') && url.pathname.endsWith('.json'), handler: 'StaleWhileRevalidate', options: { cacheName: 'rb-data' } },
          { urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org', handler: 'CacheFirst', options: { cacheName: 'rb-tiles', expiration: { maxEntries: 3000, maxAgeSeconds: 7 * 86400 } } },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
});
```

`app/index.html`:
```html
<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b5cad" />
    <meta name="description" content="Plánovač spojení jen bezplatnými autobusy MHD Říčany (1, 2, 3, 7, 9, 91, 92) a Nextbike." />
    <link rel="icon" href="/icons/favicon.ico" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180x180.png" />
    <title>Říčany zdarma</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`app/src/main.ts`:
```ts
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
```

`app/src/app.css`:
```css
:root {
  --bg: #ffffff; --fg: #14202e; --muted: #5b6776; --line: #e3e7ec; --chip: #f1f4f7;
  --accent: #0b5cad; --accent-fg: #ffffff; --ok: #1d7a35; --warn: #a65400; --bad: #c62828;
  --shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121a23; --fg: #e8edf2; --muted: #9aa7b5; --line: #263342; --chip: #1c2733;
    --accent: #5aa2ff; --accent-fg: #06121f; --ok: #4cc26a; --warn: #f0a24a; --bad: #ff6b6b;
    --shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body, #app { margin: 0; height: 100%; }
body { font: 16px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); overflow: hidden; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; min-height: 44px; }
button:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
input, select { font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; min-height: 44px; width: 100%; }
a { color: var(--accent); }
h1 { font-size: 1.15rem; margin: 4px 0; }
h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 18px 0 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { background: var(--chip); border-radius: 999px; padding: 0 14px; }
.primary { background: var(--accent); color: var(--accent-fg); border-radius: 12px; padding: 0 16px; font-weight: 600; }
.secondary { background: var(--chip); border-radius: 12px; padding: 0 16px; }
.big { width: 100%; min-height: 52px; font-size: 1.05rem; }
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: 1px solid var(--line); }
.list button.row { width: 100%; text-align: left; padding: 10px 4px; display: flex; gap: 10px; align-items: center; }
.muted { color: var(--muted); }
.small { font-size: 0.85rem; }
.banner { background: var(--warn); color: #fff; padding: 6px 12px; font-size: 0.9rem; text-align: center; }
.tag-free { background: var(--ok); color: #fff; border-radius: 6px; padding: 1px 6px; font-size: 0.8rem; font-weight: 600; }
.tag-paid { background: var(--warn); color: #fff; border-radius: 6px; padding: 1px 6px; font-size: 0.8rem; font-weight: 600; }
.seg { display: flex; background: var(--chip); border-radius: 10px; padding: 3px; gap: 3px; }
.seg button { flex: 1; border-radius: 8px; min-height: 40px; }
.seg button[aria-pressed='true'] { background: var(--bg); box-shadow: var(--shadow); font-weight: 600; }
.sheet-header { display: flex; align-items: center; gap: 8px; }
.back { font-size: 1.3rem; width: 44px; }
.error { color: var(--bad); }
```

`app/src/components/BottomSheet.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n';

  let { children }: { children: Snippet } = $props();
  const SNAPS = [0.28, 0.55, 0.9];
  let snap = $state(1);
  let dragH = $state<number | null>(null);
  let startY = 0;
  let startH = 0;
  let sheet: HTMLElement;

  function down(e: PointerEvent) {
    startY = e.clientY;
    startH = sheet.getBoundingClientRect().height;
    dragH = startH;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (dragH === null) return;
    dragH = Math.min(window.innerHeight * 0.95, Math.max(80, startH + (startY - e.clientY)));
  }
  function up() {
    if (dragH === null) return;
    const f = dragH / window.innerHeight;
    snap = SNAPS.reduce((bi, s, i) => (Math.abs(s - f) < Math.abs(SNAPS[bi] - f) ? i : bi), 0);
    dragH = null;
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') snap = Math.min(SNAPS.length - 1, snap + 1);
    if (e.key === 'ArrowDown') snap = Math.max(0, snap - 1);
  }
</script>

<section class="sheet" bind:this={sheet} style:height={dragH !== null ? `${dragH}px` : `${SNAPS[snap] * 100}%`} class:dragging={dragH !== null}>
  <div
    class="handle" role="slider" tabindex="0" aria-label={$t('resize')}
    aria-valuemin={0} aria-valuemax={SNAPS.length - 1} aria-valuenow={snap}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key}
  ><span></span></div>
  <div class="content">{@render children()}</div>
</section>

<style>
  .sheet {
    position: absolute; left: 0; right: 0; bottom: 0; z-index: 5;
    display: flex; flex-direction: column;
    background: var(--bg); border-radius: 16px 16px 0 0; box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.18);
    transition: height 0.2s ease;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .sheet.dragging { transition: none; }
  .handle { display: flex; justify-content: center; padding: 10px; cursor: grab; touch-action: none; min-height: 28px; }
  .handle span { width: 40px; height: 5px; border-radius: 3px; background: var(--muted); opacity: 0.6; }
  .content { flex: 1; overflow-y: auto; padding: 0 16px 16px; overscroll-behavior: contain; }
  @media (min-width: 900px) {
    .sheet { top: 0; right: auto; width: 400px; height: auto !important; border-radius: 0; box-shadow: var(--shadow); }
    .handle { display: none; }
    .content { padding-top: 12px; }
  }
</style>
```

`app/src/App.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { pragueNow } from '@rb/shared';
  import BottomSheet from './components/BottomSheet.svelte';
  import { route, navigate } from './lib/nav';
  import { t, lang } from './lib/i18n';
  import { loadData, daysLeft, type AppData } from './lib/data';
  import { bikesLayerOn } from './lib/ui';

  let data = $state<AppData | null>(null);
  let failed = $state(false);
  let online = $state(navigator.onLine);

  function load() {
    failed = false;
    loadData().then((d) => (data = d)).catch(() => (failed = true));
  }
  onMount(() => {
    load();
    const on = () => (online = navigator.onLine);
    addEventListener('online', on);
    addEventListener('offline', on);
    return () => { removeEventListener('online', on); removeEventListener('offline', on); };
  });
  const stale = $derived(data ? daysLeft(data.meta, pragueNow().date) < 3 : false);
</script>

<div class="app">
  <header class="topbar">
    <button class="search" onclick={() => navigate({ name: 'plan', mode: 'now' })}>🔍 {$t('whereTo')}</button>
    <button class="icon" aria-pressed={$bikesLayerOn} aria-label={$t('layerBikes')} onclick={() => bikesLayerOn.update((v) => !v)}>🚲</button>
    <button class="icon" aria-label={$t('langToggle')} onclick={() => lang.update((l) => (l === 'cs' ? 'en' : 'cs'))}>{$lang === 'cs' ? 'EN' : 'CZ'}</button>
  </header>
  {#if stale}<div class="banner" role="status">{$t('staleData')}</div>{/if}
  {#if !online}<div class="banner" role="status">{$t('offline')}</div>{/if}
  <main class="stage">
    {#if data}
      <!-- MAP -->
      <BottomSheet>
        {#if $route.name === 'plan'}
          <!-- SHEET:plan -->
        {:else if $route.name === 'stop'}
          <!-- SHEET:stop -->
        {:else if $route.name === 'line'}
          <!-- SHEET:line -->
        {:else if $route.name === 'bike'}
          <!-- SHEET:bike -->
        {:else}
          <!-- SHEET:home -->
        {/if}
      </BottomSheet>
    {:else if failed}
      <div class="center"><p>{$t('loadFailed')}</p><button class="primary" onclick={load}>{$t('retry')}</button></div>
    {:else}
      <div class="center" aria-busy="true">{$t('loading')}</div>
    {/if}
  </main>
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100dvh; }
  .topbar { display: flex; gap: 8px; padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top)); background: var(--bg); box-shadow: var(--shadow); z-index: 10; }
  .search { flex: 1; text-align: left; background: var(--chip); border-radius: 12px; padding: 0 14px; color: var(--muted); }
  .icon { width: 44px; border-radius: 12px; background: var(--chip); font-weight: 700; }
  .icon[aria-pressed='false'] { opacity: 0.5; }
  .stage { position: relative; flex: 1; overflow: hidden; }
  .center { display: grid; place-items: center; align-content: center; gap: 12px; height: 100%; }
</style>
```

- [ ] **Step 7: Icons**

`app/public/icons/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b5cad"/>
  <rect x="116" y="120" width="280" height="230" rx="40" fill="#fff"/>
  <rect x="146" y="150" width="220" height="100" rx="14" fill="#0b5cad"/>
  <circle cx="176" cy="300" r="22" fill="#0b5cad"/>
  <circle cx="336" cy="300" r="22" fill="#0b5cad"/>
  <rect x="150" y="350" width="44" height="44" rx="10" fill="#fff"/>
  <rect x="318" y="350" width="44" height="44" rx="10" fill="#fff"/>
  <text x="256" y="236" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="700" fill="#fff" text-anchor="middle">0 Kč</text>
</svg>
```
Run: `cd app && npx --yes @vite-pwa/assets-generator@1 --preset minimal-2023 public/icons/icon.svg && cd ..`
Expected: `public/icons/` now contains `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`.

- [ ] **Step 8: Build and typecheck**

Run: `npm run typecheck -w app && npm run build -w app && ls app/dist app/dist/data`
Expected: no type errors; `dist/index.html`, `dist/sw.js`, `dist/manifest.webmanifest`, and `dist/data/{stops,lines,timetable,meta}.json` exist.

Quick manual check: `npm run preview -w app &` then `curl -s localhost:4173/ricany-bus/ | grep -c 'Říčany zdarma'` → `1`; stop the preview server (`kill %1`).

- [ ] **Step 9: Deploy and nightly-refresh workflows**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
  workflow_call:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main   # when called after the nightly data commit, build the new commit
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build -w app
      - uses: actions/upload-pages-artifact@v3
        with: { path: app/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.d.outputs.page_url }}
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```

`.github/workflows/refresh-data.yml` (commits pushed with `GITHUB_TOKEN` do not trigger `push` workflows, so it calls the deploy workflow directly):
```yaml
name: Refresh timetable data
on:
  schedule:
    - cron: '30 2 * * *'   # 03:30/04:30 Prague, after PID's nightly regeneration
  workflow_dispatch:
permissions:
  contents: write
  pages: write
  id-token: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    outputs:
      changed: ${{ steps.commit.outputs.changed }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run data
      - id: commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add app/public/data
          if git diff --cached --quiet; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            git commit -m "data: refresh PID timetable $(date -u +%F)"
            git push
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi
  deploy:
    needs: refresh
    if: needs.refresh.outputs.changed == 'true'
    uses: ./.github/workflows/deploy.yml
```

- [ ] **Step 10: Commit, enable Pages, push, verify the live site**

```bash
git add -A && git commit -m "feat(app): Svelte PWA shell, i18n, hash routes, Pages deploy and nightly data refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh api -X POST repos/PokeyPoke/ricany-bus/pages -f build_type=workflow || gh api -X PUT repos/PokeyPoke/ricany-bus/pages -f build_type=workflow
git push
gh run watch --exit-status $(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
curl -s -o /dev/null -w '%{http_code}\n' https://pokeypoke.github.io/ricany-bus/
curl -s https://pokeypoke.github.io/ricany-bus/data/meta.json
```
Expected: deploy run succeeds; `200`; meta JSON printed. (First Pages deploys can take a minute to propagate — if 404, re-check with the Monitor tool until 200, max 10 min.)

Then exercise the nightly job once: `gh workflow run refresh-data.yml && sleep 5 && gh run watch --exit-status $(gh run list --workflow refresh-data.yml --limit 1 --json databaseId -q '.[0].databaseId')` → success (it commits refreshed `meta.json` and redeploys). Run `git pull --rebase` afterwards.

---

### Task 11: Live data, geocoding, geolocation, saved places, router Web Worker

**Files:**
- Create: `app/src/lib/live.ts`, `app/src/lib/geocode.ts`, `app/src/lib/geoloc.ts`, `app/src/lib/places.ts`
- Create: `app/src/router/worker.ts`, `app/src/router/client.ts`
- Test: `app/test/live.test.ts`, `app/test/geocode.test.ts`, `app/test/places.test.ts`

**Interfaces:**
- Consumes: `config.ts`, `storage.ts`, `ui.ts` (Task 10); `planTrip`, `buildNetwork`, types (Tasks 5–7); shared constants.
- Produces:
  ```ts
  // live.ts
  const delays: Writable<DelaysResponse | null>; const delaysOk: Writable<boolean>;
  const bikes: Writable<BikeStation[] | null>; const bikesOk: Writable<boolean>; const bikesAt: Writable<number | null>;
  function parseNextbike(json: unknown): BikeStation[]
  function createPoller<T>(fetcher: (s: AbortSignal) => Promise<T>, ms: number, value: Writable<T | null>, ok: Writable<boolean>, onSuccess?: (at: number) => void): () => () => void
  const useDelays: () => () => void;  const useBikes: () => () => void   // acquire → release (ref-counted)
  // geocode.ts
  interface PlaceHit extends PlaceRef { detail: string; kind: 'stop' | 'address' }
  function norm(s: string): string;  function searchStops(stops: StopRec[], q: string, limit?: number): PlaceHit[]
  function searchPhoton(q: string, signal?: AbortSignal): Promise<PlaceHit[]>
  // geoloc.ts
  function getLocation(timeoutMs?: number): Promise<{ lat: number; lon: number }>   // rejects Error('denied' | 'unavailable'); sets ui.userPos
  // places.ts
  interface SavedPlace { id: string; label: string; icon: string; lat: number; lon: number }
  const savedPlaces: Writable<SavedPlace[]>; const recents: Writable<PlaceRef[]>;
  function addPlace(p: Omit<SavedPlace, 'id'>): void; function removePlace(id: string): void; function addRecent(to: PlaceRef): void
  // client.ts
  function planInWorker(req: PlanRequest, bikes: BikeStation[] | null): Promise<PlanResult>
  ```

- [ ] **Step 1: Write failing tests**

`app/test/live.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { get, writable } from 'svelte/store';
import { parseNextbike, createPoller } from '../src/lib/live';

const place = (o: Record<string, unknown>) => ({ uid: 1, name: 'A', lat: 49.99, lng: 14.65, spot: true, maintenance: false, active_place: 1, bikes: 3, bikes_available_to_rent: 3, free_racks: 7, ...o });

describe('parseNextbike', () => {
  it('parseNextbike filters unusable places and maps fields', () => {
    const json = { countries: [{ cities: [
      { uid: 999, places: [place({ uid: 50 })] },
      { uid: 736, places: [
        place({ uid: 1 }),
        place({ uid: 2, maintenance: true }),
        place({ uid: 3, spot: false }),
        place({ uid: 4, active_place: 0 }),
        place({ uid: 5, bikes_available_to_rent: 0, bikes: 2 }),
      ] },
    ] }] };
    expect(parseNextbike(json)).toEqual([
      { uid: 1, name: 'A', lat: 49.99, lon: 14.65, bikes: 3, freeRacks: 7 },
      { uid: 5, name: 'A', lat: 49.99, lon: 14.65, bikes: 0, freeRacks: 7 },
    ]);
  });
  it('throws when the Říčany city is missing', () => {
    expect(() => parseNextbike({ countries: [] })).toThrow();
  });
});

describe('createPoller', () => {
  afterEach(() => vi.useRealTimers());
  it('polls while acquired, ref-counts, and reports failures', async () => {
    vi.useFakeTimers();
    const value = writable<number | null>(null);
    const ok = writable(true);
    let n = 0;
    const fetcher = vi.fn(async () => ++n);
    const acquire = createPoller(fetcher, 1000, value, ok);
    const r1 = acquire();
    const r2 = acquire();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(value)).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    r1();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    r2();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(3);

    const bad = createPoller(async () => { throw new Error('down'); }, 1000, value, ok);
    const r3 = bad();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(ok)).toBe(false);
    r3();
  });
});
```

`app/test/geocode.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StopRec } from '@rb/shared';
import { searchStops, searchPhoton, norm } from '../src/lib/geocode';

const s = (id: string, name: string, lat: number, lines: StopRec['lines']): StopRec => ({ id, name, platform: 'A', lat, lon: 14.65, lines, transfers: [] });
const stops = [s('a', 'Masarykovo nám.', 49.99, ['L1731']), s('b', 'Masarykovo nám.', 49.992, ['L1733']), s('c', 'Sídl.Olivovna', 50.0, ['L1736']), s('d', 'Olivovna', 50.01, ['L1737'])];

afterEach(() => vi.unstubAllGlobals());

describe('searchStops', () => {
  it('is accent-insensitive, merges platforms, ranks prefix matches first', () => {
    expect(norm('Říčany')).toBe('ricany');
    const m = searchStops(stops, 'masaryk');
    expect(m).toEqual([{ name: 'Masarykovo nám.', detail: '1 · 3', lat: 49.991, lon: 14.65, kind: 'stop' }]);
    expect(searchStops(stops, 'olivovna').map((h) => h.name)).toEqual(['Olivovna', 'Sídl.Olivovna']);
    expect(searchStops(stops, 'o')).toEqual([]);
  });
});

describe('searchPhoton', () => {
  it('maps Photon features and restricts to the Říčany bbox', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ features: [
      { geometry: { coordinates: [14.655608, 49.9918333] }, properties: { name: 'Masarykovo náměstí', district: 'Radošovice', city: 'Říčany' } },
      { geometry: { coordinates: [14.66, 50.0] }, properties: { street: 'Olivova', housenumber: '12', city: 'Říčany' } },
    ] })));
    vi.stubGlobal('fetch', fetch);
    const r = await searchPhoton('masarykovo');
    expect(r).toEqual([
      { name: 'Masarykovo náměstí', detail: 'Radošovice', lat: 49.9918333, lon: 14.655608, kind: 'address' },
      { name: 'Olivova 12', detail: 'Říčany', lat: 50.0, lon: 14.66, kind: 'address' },
    ]);
    const url = String((fetch.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('bbox=14.58%2C49.95%2C14.74%2C50.03');
  });
  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502 })));
    await expect(searchPhoton('x')).rejects.toThrow('photon 502');
  });
});
```

`app/test/places.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { addRecent, recents, addPlace, removePlace, savedPlaces } from '../src/lib/places';

describe('places', () => {
  it('recents dedupe by position and keep the 5 newest', () => {
    for (let i = 0; i < 7; i++) addRecent({ lat: 50 + i / 100, lon: 14.6, name: 'p' + i });
    addRecent({ lat: 50.03, lon: 14.6, name: 'again' });
    const r = get(recents);
    expect(r.length).toBe(5);
    expect(r[0].name).toBe('again');
    expect(r.filter((x) => Math.abs(x.lat - 50.03) < 1e-9).length).toBe(1);
  });
  it('adds and removes saved places', () => {
    addPlace({ label: 'Domů', icon: '🏠', lat: 49.99, lon: 14.65 });
    const p = get(savedPlaces)[0];
    expect(p).toMatchObject({ label: 'Domů', icon: '🏠' });
    removePlace(p.id);
    expect(get(savedPlaces)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w app -- live geocode places`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`app/src/lib/live.ts`:
```ts
import { writable, type Writable } from 'svelte/store';
import { NEXTBIKE_CITY_UID, type DelaysResponse } from '@rb/shared';
import { NEXTBIKE_URL, WORKER_URL } from '../config';
import type { BikeStation } from '../router/types';

export const delays = writable<DelaysResponse | null>(null);
export const delaysOk = writable(true);
export const bikes = writable<BikeStation[] | null>(null);
export const bikesOk = writable(true);
export const bikesAt = writable<number | null>(null);

interface NbPlace { uid: number; name: string; lat: number; lng: number; spot?: boolean; maintenance?: boolean; active_place?: number; bikes?: number; bikes_available_to_rent?: number; free_racks?: number }
interface NbCity { uid: number; places?: NbPlace[] }

export function parseNextbike(json: unknown): BikeStation[] {
  const countries = (json as { countries?: { cities?: NbCity[] }[] })?.countries ?? [];
  const city = countries.flatMap((c) => c.cities ?? []).find((c) => c.uid === NEXTBIKE_CITY_UID);
  if (!city) throw new Error('Nextbike city 736 missing');
  return (city.places ?? [])
    .filter((p) => p.spot === true && !p.maintenance && p.active_place !== 0)
    .map((p) => ({ uid: p.uid, name: p.name, lat: p.lat, lon: p.lng, bikes: p.bikes_available_to_rent ?? p.bikes ?? 0, freeRacks: p.free_racks ?? 0 }));
}

async function fetchBikes(signal: AbortSignal): Promise<BikeStation[]> {
  const r = await fetch(NEXTBIKE_URL, { signal });
  if (!r.ok) throw new Error(`nextbike ${r.status}`);
  return parseNextbike(await r.json());
}
async function fetchDelays(signal: AbortSignal): Promise<DelaysResponse> {
  const r = await fetch(`${WORKER_URL}/delays`, { signal });
  if (!r.ok) throw new Error(`delays ${r.status}`);
  return (await r.json()) as DelaysResponse;
}

export function createPoller<T>(
  fetcher: (s: AbortSignal) => Promise<T>, ms: number, value: Writable<T | null>, ok: Writable<boolean>, onSuccess?: (at: number) => void,
): () => () => void {
  let refs = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ctrl: AbortController | null = null;
  async function tick() {
    ctrl?.abort();
    const c = (ctrl = new AbortController());
    try {
      const v = await fetcher(c.signal);
      if (c.signal.aborted) return;
      value.set(v);
      ok.set(true);
      onSuccess?.(Date.now());
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') ok.set(false);
    }
  }
  return () => {
    if (refs++ === 0) { void tick(); timer = setInterval(tick, ms); }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--refs === 0) { clearInterval(timer); ctrl?.abort(); }
    };
  };
}

export const useDelays = createPoller(fetchDelays, 30_000, delays, delaysOk);
export const useBikes = createPoller(fetchBikes, 60_000, bikes, bikesOk, (at) => bikesAt.set(at));
```

`app/src/lib/geocode.ts`:
```ts
import { LINE_STYLE, RIC_BBOX, RIC_CENTER, type StopRec } from '@rb/shared';
import { PHOTON_URL } from '../config';
import type { PlaceRef } from '../router/types';

export interface PlaceHit extends PlaceRef { detail: string; kind: 'stop' | 'address' }

export const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function searchStops(stops: StopRec[], q: string, limit = 5): PlaceHit[] {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  const groups = new Map<string, StopRec[]>();
  for (const s of stops) {
    if (!norm(s.name).includes(n)) continue;
    const g = groups.get(s.name) ?? [];
    g.push(s);
    groups.set(s.name, g);
  }
  const rank = (name: string) => (norm(name).startsWith(n) ? 0 : 1);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'cs'))
    .slice(0, limit)
    .map(([name, g]) => ({
      name,
      detail: [...new Set(g.flatMap((s) => s.lines))].map((l) => LINE_STYLE[l].number).join(' · '),
      lat: +(g.reduce((a, s) => a + s.lat, 0) / g.length).toFixed(6),
      lon: +(g.reduce((a, s) => a + s.lon, 0) / g.length).toFixed(6),
      kind: 'stop' as const,
    }));
}

interface PhotonFeature { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }

export async function searchPhoton(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const u = new URL(PHOTON_URL);
  u.searchParams.set('q', q);
  u.searchParams.set('lat', String(RIC_CENTER.lat));
  u.searchParams.set('lon', String(RIC_CENTER.lon));
  u.searchParams.set('bbox', RIC_BBOX.join(','));
  u.searchParams.set('limit', '6');
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`photon ${r.status}`);
  const j = (await r.json()) as { features?: PhotonFeature[] };
  return (j.features ?? []).map((f) => {
    const p = f.properties;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const name = p.name || street || p.city || q;
    const detail = [p.name && street ? street : '', p.district || p.city || ''].filter(Boolean).join(', ');
    return { name, detail, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], kind: 'address' as const };
  });
}
```

`app/src/lib/geoloc.ts`:
```ts
import { userPos } from './ui';

export function getLocation(timeoutMs = 10_000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const v = { lat: p.coords.latitude, lon: p.coords.longitude }; userPos.set(v); resolve(v); },
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
```

`app/src/lib/places.ts`:
```ts
import { writable } from 'svelte/store';
import { load, save } from './storage';
import type { PlaceRef } from '../router/types';

export interface SavedPlace { id: string; label: string; icon: string; lat: number; lon: number }

export const savedPlaces = writable<SavedPlace[]>(load<SavedPlace[]>('rb.places', []));
savedPlaces.subscribe((v) => save('rb.places', v));
export const recents = writable<PlaceRef[]>(load<PlaceRef[]>('rb.recents', []));
recents.subscribe((v) => save('rb.recents', v));

const same = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;

export function addPlace(p: Omit<SavedPlace, 'id'>): void {
  savedPlaces.update((l) => [...l, { ...p, id: Math.random().toString(36).slice(2, 10) }]);
}
export function removePlace(id: string): void {
  savedPlaces.update((l) => l.filter((p) => p.id !== id));
}
export function addRecent(to: PlaceRef): void {
  recents.update((l) => [{ lat: to.lat, lon: to.lon, name: to.name }, ...l.filter((x) => !same(x, to))].slice(0, 5));
}
```

`app/src/router/worker.ts`:
```ts
import type { StopsFile, TimetableFile } from '@rb/shared';
import { buildNetwork, type Network } from './network';
import { planTrip } from './plan';
import type { BikeStation, PlanRequest } from './types';

const base = `${import.meta.env.BASE_URL}data/`;
const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };
let ready: Promise<{ stops: StopsFile['stops']; tt: TimetableFile }> | null = null;
const nets = new Map<string, Network>();

function load() {
  ready ??= Promise.all([
    fetch(`${base}stops.json`).then((r) => r.json() as Promise<StopsFile>),
    fetch(`${base}timetable.json`).then((r) => r.json() as Promise<TimetableFile>),
  ]).then(([s, tt]) => ({ stops: s.stops, tt }));
  return ready;
}

scope.onmessage = async (e: MessageEvent<{ id: number; req: PlanRequest; bikes: BikeStation[] | null }>) => {
  const { id, req, bikes } = e.data;
  try {
    const { stops, tt } = await load();
    const ctx = {
      stops,
      netFor: (d: string) => {
        let n = nets.get(d);
        if (!n) { n = buildNetwork(stops, tt, d); nets.set(d, n); }
        return n;
      },
    };
    scope.postMessage({ id, result: planTrip(ctx, req, bikes) });
  } catch (err) {
    ready = null;
    scope.postMessage({ id, error: String(err) });
  }
};
```

`app/src/router/client.ts`:
```ts
import type { BikeStation, PlanRequest, PlanResult } from './types';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: PlanResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: PlanResult; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result!);
    };
  }
  return worker;
}

export function planInWorker(req: PlanRequest, bikes: BikeStation[] | null): Promise<PlanResult> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, req: structuredClone(req), bikes: bikes ? structuredClone(bikes) : null });
  });
}
```

- [ ] **Step 4: Run tests, typecheck, build**

Run: `npm test -w app && npm run typecheck -w app && npm run build -w app`
Expected: all PASS; build output contains a `worker-*.js` chunk (`ls app/dist/assets | grep -i worker`).

- [ ] **Step 5: Commit and push**

```bash
git add -A && git commit -m "feat(app): live delays/Nextbike pollers, Photon + stop search, saved places, router worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 12: Map view (lines, stops, Nextbike, trip overlay, markers, locate)

**Files:**
- Create: `app/src/map/geojson.ts`, `app/src/map/layers.ts`, `app/src/map/MapView.svelte`
- Modify: `app/src/App.svelte` (replace `<!-- MAP -->`)
- Test: `app/test/geojson.test.ts`

**Interfaces:**
- Consumes: `AppData` (Task 10), `ui.ts` stores, `nav.navigate`, `live.bikes/useBikes`, `geoloc.getLocation`, `MAP_STYLE`, `RIC_CENTER`, `LINE_STYLE`, `Itinerary`, `BikeStation`.
- Produces:
  ```ts
  interface Feature { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] }; properties: Record<string, string | number> }
  interface FC { type: 'FeatureCollection'; features: Feature[] }
  function linesGeoJson(lines: LineRec[]): FC          // props: routeId, number, color, directionId
  function stopsGeoJson(stops: StopRec[]): FC          // props: id, name, platform
  function bikesGeoJson(stations: BikeStation[]): FC   // props: uid, name, bikes
  function tripGeoJson(it: Itinerary, data: AppData): FC // props: kind ('bus'|'walk'|'bike'), color
  function bbox(coords: [number, number][]): [[number, number], [number, number]] | null
  function addLayers(map: maplibregl.Map, data: AppData): void   // layer ids: lines-casing, lines, lines-hl, stops, stops-label, bikes, bikes-count, trip-bus, trip-walk, trip-bike
  ```
  `<MapView {data} />` — clicking a stop navigates to `stop`, a Nextbike station to `bike`, a line to `line`; while `pickTarget` is set, a click sets `mapPick` instead.

- [ ] **Step 1: Write failing test**

`app/test/geojson.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { LineRec } from '@rb/shared';
import { linesGeoJson, stopsGeoJson, bikesGeoJson, tripGeoJson, bbox } from '../src/map/geojson';
import type { AppData } from '../src/lib/data';
import type { Itinerary } from '../src/router/types';
import { stops, timetable, H } from './fixtures/net';

const line: LineRec = { routeId: 'L1731', number: '1', color: '#E4002B', text: '#FFFFFF', longName: 'x', directions: [{ directionId: 0, headsign: 'S2', stops: [0, 1, 2], shape: [[14.65, 49.99], [14.65, 50.018]] }] };
const data: AppData = { stops, lines: [line], timetable, meta: { feedStart: '', feedEnd: '', generatedAt: '', tripCount: 0 } };

describe('geojson', () => {
  it('lines, stops and bikes', () => {
    expect(linesGeoJson([line]).features[0]).toEqual({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[14.65, 49.99], [14.65, 50.018]] }, properties: { routeId: 'L1731', number: '1', color: '#E4002B', directionId: 0 } });
    expect(stopsGeoJson(stops).features.length).toBe(6);
    expect(stopsGeoJson(stops).features[0].properties).toEqual({ id: 'S0', name: 'S0', platform: 'A' });
    expect(bikesGeoJson([{ uid: 9, name: 'B', lat: 1, lon: 2, bikes: 3, freeRacks: 1 }]).features[0]).toEqual({ type: 'Feature', geometry: { type: 'Point', coordinates: [2, 1] }, properties: { uid: 9, name: 'B', bikes: 3 } });
  });
  it('trip overlay draws buses through their stops and walks as straight lines', () => {
    const it0: Itinerary = { date: '20261019', depart: H(8, 0), arrive: H(8, 12), rides: 1, free: true, legs: [
      { kind: 'bus', routeId: 'L1731', headsign: 'S2', tripId: 'a1', serviceDate: '20261019', pattern: 0, boardPos: 0, alightPos: 2, boardSeq: 1, alightSeq: 3, from: 0, to: 2, depart: H(8, 0), arrive: H(8, 10), stopCount: 2 },
      { kind: 'walk', from: { lat: 50.018, lon: 14.65, name: 'S2' }, to: { lat: 50.019, lon: 14.651, name: 'x' }, depart: H(8, 10), arrive: H(8, 12), meters: 130 },
    ] };
    const fc = tripGeoJson(it0, data);
    expect(fc.features.map((f) => f.properties.kind)).toEqual(['bus', 'walk']);
    expect(fc.features[0].geometry.coordinates).toEqual([[14.65, 49.99], [14.65, 50.004], [14.65, 50.018]]);
    expect(fc.features[0].properties.color).toBe('#E4002B');
  });
  it('bbox', () => {
    expect(bbox([[1, 2], [3, 0], [2, 5]])).toEqual([[1, 0], [3, 5]]);
    expect(bbox([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w app -- geojson`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement geojson.ts**

```ts
import { LINE_STYLE, type LineRec, type StopRec } from '@rb/shared';
import type { AppData } from '../lib/data';
import type { BikeStation, Itinerary } from '../router/types';

export interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] };
  properties: Record<string, string | number>;
}
export interface FC { type: 'FeatureCollection'; features: Feature[] }

const fc = (features: Feature[]): FC => ({ type: 'FeatureCollection', features });
const point = (lon: number, lat: number, properties: Feature['properties']): Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties });
const lineStr = (coordinates: [number, number][], properties: Feature['properties']): Feature => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties });

export const linesGeoJson = (lines: LineRec[]) =>
  fc(lines.flatMap((l) => l.directions.map((d) => lineStr(d.shape, { routeId: l.routeId, number: l.number, color: l.color, directionId: d.directionId }))));

export const stopsGeoJson = (stops: StopRec[]) => fc(stops.map((s) => point(s.lon, s.lat, { id: s.id, name: s.name, platform: s.platform })));

export const bikesGeoJson = (stations: BikeStation[]) => fc(stations.map((b) => point(b.lon, b.lat, { uid: b.uid, name: b.name, bikes: b.bikes })));

export function tripGeoJson(it: Itinerary, data: AppData): FC {
  return fc(it.legs.map((l) => {
    if (l.kind === 'bus') {
      const p = data.timetable.patterns[l.pattern];
      const coords = p.stops.slice(l.boardPos, l.alightPos + 1).map((i) => [data.stops[i].lon, data.stops[i].lat] as [number, number]);
      return lineStr(coords, { kind: 'bus', color: LINE_STYLE[l.routeId].color });
    }
    return lineStr([[l.from.lon, l.from.lat], [l.to.lon, l.to.lat]], { kind: l.kind, color: l.kind === 'bike' ? '#2e9d4a' : '#555555' });
  }));
}

export function bbox(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}
```

- [ ] **Step 4: Implement layers.ts**

```ts
import type maplibregl from 'maplibre-gl';
import type { AppData } from '../lib/data';
import { linesGeoJson, stopsGeoJson, type FC } from './geojson';

const empty: FC = { type: 'FeatureCollection', features: [] };
const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

export function addLayers(map: maplibregl.Map, data: AppData): void {
  map.addSource('lines', { type: 'geojson', data: linesGeoJson(data.lines) as never });
  map.addSource('stops', { type: 'geojson', data: stopsGeoJson(data.stops) as never });
  map.addSource('bikes', { type: 'geojson', data: empty as never });
  map.addSource('trip', { type: 'geojson', data: empty as never });

  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  map.addLayer({ id: 'lines-casing', type: 'line', source: 'lines', layout: round, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'lines', type: 'line', source: 'lines', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.85 } });
  map.addLayer({ id: 'lines-hl', type: 'line', source: 'lines', layout: round, filter: ['==', ['get', 'routeId'], ''], paint: { 'line-color': ['get', 'color'], 'line-width': 8 } });

  map.addLayer({ id: 'trip-walk', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'walk'], paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1, 1.5] } });
  map.addLayer({ id: 'trip-bike', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'bike'], paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-dasharray': [2, 1] } });
  map.addLayer({ id: 'trip-bus', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'bus'], paint: { 'line-color': ['get', 'color'], 'line-width': 8 } });

  map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 8],
    'circle-color': '#ffffff', 'circle-stroke-color': '#1d2a3a', 'circle-stroke-width': 2,
  } });
  map.addLayer({ id: 'stops-label', type: 'symbol', source: 'stops', minzoom: 15, layout: {
    'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true,
  }, paint: { 'text-color': '#1d2a3a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } });

  map.addLayer({ id: 'bikes', type: 'circle', source: 'bikes', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 11],
    'circle-color': ['case', ['>', ['get', 'bikes'], 0], '#2e9d4a', '#8a96a3'],
    'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
  } });
  map.addLayer({ id: 'bikes-count', type: 'symbol', source: 'bikes', minzoom: 13, layout: {
    'text-field': ['to-string', ['get', 'bikes']], 'text-font': FONT_BOLD, 'text-size': 11, 'text-allow-overlap': true,
  }, paint: { 'text-color': '#ffffff' } });
}
```

- [ ] **Step 5: Implement MapView.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { RIC_CENTER } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { MAP_STYLE } from '../config';
  import { bikes, useBikes } from '../lib/live';
  import { bikesLayerOn, pickTarget, mapPick, tripOverlay, highlightLine, focusPoints, userPos, planMarkers } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { getLocation } from '../lib/geoloc';
  import { t } from '../lib/i18n';
  import { addLayers } from './layers';
  import { bikesGeoJson, tripGeoJson, bbox, type FC } from './geojson';

  let { data }: { data: AppData } = $props();
  let el: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let ready = $state(false);
  const markers: Record<string, maplibregl.Marker | undefined> = {};

  const setData = (id: string, fc: FC) => (map?.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(fc as never);

  function marker(key: string, pos: { lat: number; lon: number } | undefined | null, cls: string, label = '') {
    markers[key]?.remove();
    markers[key] = undefined;
    if (!map || !pos) return;
    const e = document.createElement('div');
    e.className = `rb-marker ${cls}`;
    e.textContent = label;
    markers[key] = new maplibregl.Marker({ element: e }).setLngLat([pos.lon, pos.lat]).addTo(map);
  }

  function padding() {
    const mobile = window.innerWidth < 900;
    return mobile ? { top: 40, left: 40, right: 40, bottom: Math.round(window.innerHeight * 0.5) } : { top: 60, right: 60, bottom: 60, left: 460 };
  }

  function onClick(e: maplibregl.MapMouseEvent) {
    if (!map) return;
    if (get(pickTarget)) { mapPick.set({ lat: e.lngLat.lat, lon: e.lngLat.lng }); return; }
    const layers = ['bikes', 'stops', 'lines'].filter((id) => map!.getLayer(id));
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
    const f = map.queryRenderedFeatures(box, { layers })[0];
    if (!f) return;
    const p = f.properties as Record<string, string | number>;
    if (f.layer.id === 'bikes') navigate({ name: 'bike', uid: Number(p.uid) });
    else if (f.layer.id === 'stops') navigate({ name: 'stop', stopId: String(p.id) });
    else navigate({ name: 'line', number: String(p.number), dir: Number(p.directionId) || 0 });
  }

  async function locate() {
    try {
      const p = await getLocation();
      map?.flyTo({ center: [p.lon, p.lat], zoom: 15 });
    } catch { /* the planner shows location errors; the map button fails quietly */ }
  }

  onMount(() => {
    map = new maplibregl.Map({ container: el, style: MAP_STYLE, center: [RIC_CENTER.lon, RIC_CENTER.lat], zoom: 13, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { addLayers(map!, data); ready = true; });
    map.on('click', onClick);
    map.on('mousemove', (e) => {
      const layers = ['bikes', 'stops', 'lines'].filter((id) => map!.getLayer(id));
      map!.getCanvas().style.cursor = get(pickTarget) ? 'crosshair' : map!.queryRenderedFeatures(e.point, { layers }).length ? 'pointer' : '';
    });
    return () => { map?.remove(); map = null; };
  });

  $effect(() => { if ($bikesLayerOn) return useBikes(); });
  $effect(() => {
    if (!ready || !map) return;
    setData('bikes', bikesGeoJson($bikes ?? []));
    for (const id of ['bikes', 'bikes-count']) map.setLayoutProperty(id, 'visibility', $bikesLayerOn ? 'visible' : 'none');
  });
  $effect(() => {
    if (!ready || !map) return;
    map.setFilter('lines-hl', ['==', ['get', 'routeId'], $highlightLine ?? ''] as maplibregl.FilterSpecification);
    map.setPaintProperty('lines', 'line-opacity', $highlightLine || $tripOverlay ? 0.3 : 0.85);
  });
  $effect(() => {
    if (!ready || !map) return;
    setData('trip', $tripOverlay ? tripGeoJson($tripOverlay, data) : { type: 'FeatureCollection', features: [] });
  });
  $effect(() => {
    if (!ready || !map) return;
    marker('from', $planMarkers.from, 'from', 'A');
    marker('to', $planMarkers.to, 'to', 'B');
  });
  $effect(() => { if (ready) marker('me', $userPos, 'me'); });
  $effect(() => {
    if (!ready || !map || !$focusPoints?.length) return;
    const b = bbox($focusPoints);
    if (!b) return;
    if ($focusPoints.length === 1) map.easeTo({ center: $focusPoints[0], zoom: Math.max(map.getZoom(), 15), padding: padding() });
    else map.fitBounds(b, { padding: padding(), maxZoom: 16, duration: 600 });
  });
</script>

<div class="map" bind:this={el} class:picking={$pickTarget !== null}></div>
<button class="locate" aria-label={$t('locate')} onclick={locate}>📍</button>

<style>
  .map { position: absolute; inset: 0; }
  .locate { position: absolute; right: 10px; top: 90px; z-index: 4; width: 44px; height: 44px; border-radius: 10px; background: var(--bg); box-shadow: var(--shadow); font-size: 1.2rem; }
  :global(.rb-marker) { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px; border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4); }
  :global(.rb-marker.from) { background: #1d7a35; }
  :global(.rb-marker.to) { background: #c62828; }
  :global(.rb-marker.me) { width: 18px; height: 18px; background: #1a73e8; }
</style>
```

- [ ] **Step 6: Wire into App.svelte**

In `app/src/App.svelte` add `import MapView from './map/MapView.svelte';` after the BottomSheet import, and replace the line `      <!-- MAP -->` with `      <MapView {data} />`.

- [ ] **Step 7: Run tests, typecheck, build, and look at it**

Run: `npm test -w app && npm run typecheck -w app && npm run build -w app`
Expected: PASS / no errors / build OK.

Visual check: `npm run dev -w app` (background), then use the `run` skill or Claude-in-Chrome to open `http://localhost:5173/ricany-bus/` at a 390×844 viewport and take a screenshot. Expected: Říčany map with colored lines, white stop dots, green/grey Nextbike circles, bottom sheet. Clicking a stop changes the hash to `#/stop/...`. Stop the dev server afterwards.

- [ ] **Step 8: Commit and push**

```bash
git add -A && git commit -m "feat(app): MapLibre map with free lines, stops, Nextbike and trip overlay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 13: Home sheet, line badges, saved places

**Files:**
- Create: `app/src/components/LineBadge.svelte`, `app/src/components/PlaceInput.svelte`, `app/src/components/AddPlace.svelte`, `app/src/sheets/Home.svelte`
- Modify: `app/src/App.svelte` (replace `<!-- SHEET:home -->`)

**Interfaces:**
- Consumes: `places.ts`, `geocode.ts`, `geoloc.ts`, `ui.ts`, `nav.ts`, `i18n.ts` (Tasks 10–11); `LINE_STYLE`, `LINE_ORDER`.
- Produces:
  - `<LineBadge routeId={FreeRouteId} />` — colored pill with the line number.
  - `<PlaceInput label={string} value={PlaceRef | undefined} stops={StopRec[]} target={'from' | 'to' | 'add'} onChange={(p: PlaceRef) => void} />` — search field with suggestions: 📍 my location, 📌 pick on map, saved places, matching stops (🚏), Photon addresses. Used by Home (AddPlace) and Planner (Task 14).
  - `<AddPlace stops={StopRec[]} onDone={() => void} />`
  - `<Home {data} />`

- [ ] **Step 1: LineBadge.svelte**

```svelte
<script lang="ts">
  import { LINE_STYLE, type FreeRouteId } from '@rb/shared';
  let { routeId }: { routeId: FreeRouteId } = $props();
  const s = $derived(LINE_STYLE[routeId]);
</script>

<span class="badge" style:background={s.color} style:color={s.text}>{s.number}</span>

<style>
  .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 26px; padding: 0 7px; border-radius: 7px; font-weight: 800; font-size: 0.95rem; }
</style>
```

- [ ] **Step 2: PlaceInput.svelte**

```svelte
<script lang="ts">
  import type { StopRec } from '@rb/shared';
  import type { PlaceRef } from '../router/types';
  import { searchStops, searchPhoton, type PlaceHit } from '../lib/geocode';
  import { getLocation } from '../lib/geoloc';
  import { savedPlaces } from '../lib/places';
  import { pickTarget, mapPick } from '../lib/ui';
  import { t } from '../lib/i18n';

  let { label, value, stops, target, onChange }: {
    label: string; value: PlaceRef | undefined; stops: StopRec[]; target: 'from' | 'to' | 'add'; onChange: (p: PlaceRef) => void;
  } = $props();

  let q = $state('');
  let open = $state(false);
  let hits = $state<PlaceHit[]>([]);
  let msg = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | null = null;
  const inputId = `pi-${target}`;

  function onInput() {
    open = true;
    msg = '';
    clearTimeout(timer);
    const query = q.trim();
    hits = searchStops(stops, query);
    if (query.length < 3) return;
    timer = setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const remote = await searchPhoton(query, ctrl.signal);
        hits = [...searchStops(stops, query), ...remote];
      } catch (e) {
        if ((e as Error).name !== 'AbortError') msg = $t('geocodeFailed');
      }
    }, 250);
  }
  function choose(p: PlaceRef) {
    onChange({ lat: p.lat, lon: p.lon, name: p.name });
    q = '';
    open = false;
    hits = [];
    msg = '';
  }
  async function useMe() {
    try {
      const p = await getLocation();
      choose({ ...p, name: $t('myLocation') });
    } catch (e) {
      msg = (e as Error).message === 'denied' ? $t('locationDenied') : $t('locationUnavailable');
    }
  }
  function pick() {
    open = false;
    pickTarget.set(target);
  }
  $effect(() => {
    const p = $mapPick;
    if (p && $pickTarget === target) {
      pickTarget.set(null);
      mapPick.set(null);
      choose({ ...p, name: $t('pointOnMap') });
    }
  });
</script>

<div class="pi">
  <label for={inputId}>{label}</label>
  <input
    id={inputId} type="search" autocomplete="off" bind:value={q} oninput={onInput}
    onfocus={() => (open = true)} onblur={() => setTimeout(() => (open = false), 200)}
    onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
    placeholder={value?.name ?? $t('searchPlaceholder')} class:has-value={!!value}
  />
  {#if $pickTarget === target}<p class="hint">{$t('tapMapHint')}</p>{/if}
  {#if open}
    <ul class="suggest" role="listbox" aria-label={label}>
      <li><button type="button" class="row" onmousedown={(e) => e.preventDefault()} onclick={useMe}>📍 {$t('myLocation')}</button></li>
      <li><button type="button" class="row" onmousedown={(e) => e.preventDefault()} onclick={pick}>📌 {$t('pickOnMap')}</button></li>
      {#each $savedPlaces as s (s.id)}
        <li><button type="button" class="row" onmousedown={(e) => e.preventDefault()} onclick={() => choose({ lat: s.lat, lon: s.lon, name: s.label })}>{s.icon} {s.label}</button></li>
      {/each}
      {#each hits as h, i (`${h.kind}-${h.name}-${i}`)}
        <li><button type="button" class="row" onmousedown={(e) => e.preventDefault()} onclick={() => choose(h)}>
          <span>{h.kind === 'stop' ? '🚏' : '📌'}</span><span>{h.name} <small class="muted">{h.detail}</small></span>
        </button></li>
      {/each}
      {#if msg}<li class="msg" role="status">{msg}</li>{/if}
    </ul>
  {/if}
  {#if msg && !open}<p class="msg" role="status">{msg}</p>{/if}
</div>

<style>
  .pi { position: relative; margin-bottom: 8px; }
  label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 2px; }
  input.has-value::placeholder { color: var(--fg); opacity: 1; font-weight: 600; }
  .suggest { position: absolute; z-index: 20; left: 0; right: 0; list-style: none; margin: 4px 0 0; padding: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); max-height: 50vh; overflow-y: auto; }
  .suggest .row { width: 100%; text-align: left; display: flex; gap: 8px; align-items: center; padding: 8px; border-radius: 8px; }
  .suggest .row:hover { background: var(--chip); }
  .hint { color: var(--accent); font-weight: 600; margin: 4px 0; }
  .msg { color: var(--warn); padding: 8px; font-size: 0.9rem; }
</style>
```

- [ ] **Step 3: AddPlace.svelte**

```svelte
<script lang="ts">
  import type { StopRec } from '@rb/shared';
  import type { PlaceRef } from '../router/types';
  import PlaceInput from './PlaceInput.svelte';
  import { addPlace } from '../lib/places';
  import { t } from '../lib/i18n';

  let { stops, onDone }: { stops: StopRec[]; onDone: () => void } = $props();
  const ICONS = ['🏠', '💼', '🏫', '⭐', '🛒', '❤️'];
  let label = $state('');
  let icon = $state('🏠');
  let place = $state<PlaceRef | undefined>(undefined);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!place || !label.trim()) return;
    addPlace({ label: label.trim(), icon, lat: place.lat, lon: place.lon });
    onDone();
  }
</script>

<form class="add" onsubmit={submit}>
  <label for="ap-name">{$t('placeName')}</label>
  <input id="ap-name" bind:value={label} placeholder={$t('homePlace')} required />
  <div class="icons" role="radiogroup" aria-label="Icon">
    {#each ICONS as i (i)}
      <button type="button" role="radio" aria-checked={icon === i} class:sel={icon === i} onclick={() => (icon = i)}>{i}</button>
    {/each}
  </div>
  <PlaceInput label={$t('searchPlaceholder')} value={place} {stops} target="add" onChange={(p) => (place = p)} />
  <div class="actions">
    <button type="button" class="secondary" onclick={onDone}>{$t('cancel')}</button>
    <button type="submit" class="primary" disabled={!place || !label.trim()}>{$t('save')}</button>
  </div>
</form>

<style>
  .add { background: var(--chip); border-radius: 12px; padding: 12px; margin-top: 8px; display: grid; gap: 8px; }
  label { font-size: 0.8rem; color: var(--muted); }
  .icons { display: flex; gap: 6px; }
  .icons button { width: 44px; border-radius: 10px; background: var(--bg); font-size: 1.2rem; }
  .icons button.sel { outline: 3px solid var(--accent); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  button[disabled] { opacity: 0.5; cursor: default; }
</style>
```

- [ ] **Step 4: Home.svelte**

```svelte
<script lang="ts">
  import { LINE_ORDER, type LineRec } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import { savedPlaces, recents, removePlace } from '../lib/places';
  import { tripOverlay, highlightLine, planMarkers } from '../lib/ui';
  import LineBadge from '../components/LineBadge.svelte';
  import AddPlace from '../components/AddPlace.svelte';

  let { data }: { data: AppData } = $props();
  let adding = $state(false);
  let editing = $state(false);
  const lines = $derived(LINE_ORDER.map((id) => data.lines.find((l) => l.routeId === id)).filter((l): l is LineRec => !!l));

  $effect(() => { tripOverlay.set(null); highlightLine.set(null); planMarkers.set({}); });
</script>

<button class="primary big" onclick={() => navigate({ name: 'plan', mode: 'now' })}>🔍 {$t('whereTo')}</button>

<div class="row-head">
  <h2>{$t('myPlaces')}</h2>
  {#if $savedPlaces.length}<button class="link" onclick={() => (editing = !editing)}>{editing ? $t('done') : $t('edit')}</button>{/if}
</div>
<div class="chips">
  {#each $savedPlaces as p (p.id)}
    <span class="saved">
      <button class="chip" onclick={() => navigate({ name: 'plan', mode: 'now', to: { lat: p.lat, lon: p.lon, name: p.label } })}>{p.icon} {p.label}</button>
      {#if editing}<button class="x" aria-label={`${$t('remove')} ${p.label}`} onclick={() => removePlace(p.id)}>✕</button>{/if}
    </span>
  {/each}
  {#if !adding}<button class="chip" onclick={() => (adding = true)}>＋ {$t('addPlace')}</button>{/if}
</div>
{#if adding}<AddPlace stops={data.stops} onDone={() => (adding = false)} />{/if}

{#if $recents.length}
  <h2>{$t('recent')}</h2>
  <ul class="list">
    {#each $recents as r (`${r.lat},${r.lon}`)}
      <li><button class="row" onclick={() => navigate({ name: 'plan', mode: 'now', to: r })}>🕘 {r.name}</button></li>
    {/each}
  </ul>
{/if}

<h2>{$t('lines')}</h2>
<div class="chips">
  {#each lines as l (l.routeId)}
    <button class="line" aria-label={`${$t('lines')} ${l.number}`} onclick={() => navigate({ name: 'line', number: l.number, dir: 0 })}><LineBadge routeId={l.routeId} /></button>
  {/each}
</div>

<p class="muted small attr">{$t('attribution')}</p>

<style>
  .row-head { display: flex; align-items: center; justify-content: space-between; }
  .link { color: var(--accent); min-height: 32px; }
  .saved { display: inline-flex; align-items: center; }
  .x { width: 32px; min-height: 32px; color: var(--bad); }
  .line { min-width: 44px; display: grid; place-items: center; }
  .attr { margin-top: 24px; }
</style>
```

- [ ] **Step 5: Wire into App.svelte**

Add `import Home from './sheets/Home.svelte';` and replace the line `          <!-- SHEET:home -->` with `          <Home {data} />`.

- [ ] **Step 6: Typecheck, build, visual check**

Run: `npm run typecheck -w app && npm test -w app && npm run build -w app`
Expected: no errors.
Visual (dev server + browser at 390×844): home shows "Kam jedete?", "Moje místa" with "＋ Přidat místo", and 7 colored line badges 1 2 3 7 9 91 92. Add a place via "Vybrat na mapě" → tap map → Uložit; reload; chip persists.

- [ ] **Step 7: Commit and push**

```bash
git add -A && git commit -m "feat(app): home sheet with saved places, recents and line chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 14: Planner, results, trip detail

**Files:**
- Create: `app/src/components/DelayBadge.svelte`, `app/src/components/ItineraryCard.svelte`, `app/src/sheets/TripDetail.svelte`, `app/src/sheets/Planner.svelte`
- Modify: `app/src/App.svelte` (replace `<!-- SHEET:plan -->`)

**Interfaces:**
- Consumes: `planInWorker` (Task 11), `overlayDelays`, `tripDelay` (Task 8), `PlaceInput`, `LineBadge` (Task 13), stores from `live.ts`/`ui.ts`, `navigate`/`route`, `addRecent`, `getLocation`, shared time helpers.
- Produces:
  - `<DelayBadge sec={number | null} live={boolean} />` — `+3 min` (late), `−1 min`, `±0 min`, or `bez živých dat` when live data is down.
  - `<ItineraryCard it={Itinerary} stops={StopRec[]} today={string} onclick={() => void} />` — root element is `<button class="card">`.
  - `<TripDetail it={Itinerary} {data} onBack={() => void} />`
  - `<Planner {data} />` — reads/writes the `plan` route; `sel` = `f<i>` (free), `b<i>` (bike), `w` (walk).

- [ ] **Step 1: DelayBadge.svelte**

```svelte
<script lang="ts">
  import { t } from '../lib/i18n';
  let { sec, live }: { sec: number | null; live: boolean } = $props();
  const min = $derived(sec == null ? null : Math.round(sec / 60));
</script>

{#if !live}
  <span class="nolive">{$t('noLive')}</span>
{:else if min != null}
  <span class="d" class:late={min > 0} class:early={min < 0}>{min > 0 ? `+${min}` : min < 0 ? `−${-min}` : '±0'} min</span>
{/if}

<style>
  .d { font-size: 0.8rem; font-weight: 700; color: var(--ok); margin-left: 4px; }
  .d.late { color: var(--bad); }
  .d.early { color: var(--warn); }
  .nolive { font-size: 0.75rem; color: var(--muted); margin-left: 4px; }
</style>
```

- [ ] **Step 2: ItineraryCard.svelte**

```svelte
<script lang="ts">
  import { addDays, formatHM, type StopRec } from '@rb/shared';
  import type { Itinerary } from '../router/types';
  import { tripDelay } from '../router/delays';
  import { delays, delaysOk } from '../lib/live';
  import { t } from '../lib/i18n';
  import LineBadge from './LineBadge.svelte';
  import DelayBadge from './DelayBadge.svelte';

  let { it, stops, today, onclick }: { it: Itinerary; stops: StopRec[]; today: string; onclick: () => void } = $props();
  const firstBus = $derived(it.legs.find((l) => l.kind === 'bus'));
  const mins = (a: number, b: number) => Math.max(1, Math.round((b - a) / 60));
  const dayLabel = $derived(it.date === today ? '' : it.date === addDays(today, 1) ? $t('tomorrow') : `${+it.date.slice(6, 8)}. ${+it.date.slice(4, 6)}.`);
</script>

<button class="card" {onclick}>
  <div class="top">
    <strong class="times">{formatHM(it.depart)} – {formatHM(it.arrive)}</strong>
    <span class="muted">{$t('minutes', { n: mins(it.depart, it.arrive) })}</span>
    {#if dayLabel}<span class="day">{dayLabel}</span>{/if}
    <span class="spacer"></span>
    {#if it.free}<span class="tag-free">{$t('free')}</span>{:else}<span class="tag-paid">{$t('paid')}</span>{/if}
  </div>
  <div class="chain">
    {#each it.legs as l, i (i)}
      {#if i}<span class="sep" aria-hidden="true">›</span>{/if}
      {#if l.kind === 'bus'}<LineBadge routeId={l.routeId} />
      {:else if l.kind === 'walk'}<span class="walk">🚶{mins(l.depart, l.arrive)}</span>
      {:else}<span class="bike">🚲{mins(l.depart, l.arrive)}</span>{/if}
    {/each}
  </div>
  {#if firstBus && firstBus.kind === 'bus'}
    <div class="small muted">
      {formatHM(firstBus.depart)} · {stops[firstBus.from].name}
      <DelayBadge sec={tripDelay($delays, firstBus.tripId, firstBus.serviceDate, firstBus.boardSeq)} live={$delaysOk} />
    </div>
  {/if}
</button>

<style>
  .card { width: 100%; text-align: left; display: grid; gap: 6px; padding: 12px 4px; }
  .top { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .times { font-size: 1.1rem; }
  .day { background: var(--chip); border-radius: 6px; padding: 0 6px; font-size: 0.8rem; font-weight: 600; }
  .spacer { flex: 1; }
  .chain { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .sep { color: var(--muted); }
  .walk, .bike { font-size: 0.9rem; }
</style>
```

- [ ] **Step 3: TripDetail.svelte**

```svelte
<script lang="ts">
  import { formatHM } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import type { Itinerary } from '../router/types';
  import { overlayDelays } from '../router/delays';
  import { delays, delaysOk } from '../lib/live';
  import { tripOverlay, focusPoints } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';
  import DelayBadge from '../components/DelayBadge.svelte';

  let { it, data, onBack }: { it: Itinerary; data: AppData; onBack: () => void } = $props();
  const ov = $derived(overlayDelays(it, $delays));
  const mins = (a: number, b: number) => Math.max(1, Math.round((b - a) / 60));
  const stopLabel = (i: number) => `${data.stops[i].name}${data.stops[i].platform ? ` (${data.stops[i].platform})` : ''}`;

  $effect(() => {
    tripOverlay.set(it);
    focusPoints.set(it.legs.flatMap((l): [number, number][] => l.kind === 'bus'
      ? [[data.stops[l.from].lon, data.stops[l.from].lat], [data.stops[l.to].lon, data.stops[l.to].lat]]
      : [[l.from.lon, l.from.lat], [l.to.lon, l.to.lat]]));
    return () => tripOverlay.set(null);
  });
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={onBack}>←</button>
  <h1>{formatHM(it.depart)} – {formatHM(it.arrive)}</h1>
  {#if it.free}<span class="tag-free">{$t('free')}</span>{:else}<span class="tag-paid">{$t('paid')}</span>{/if}
</div>

<ol class="legs">
  {#each it.legs as l, i (i)}
    <li class="leg {l.kind}">
      <div class="time">{formatHM(l.depart)}{#if l.kind === 'bus'}<DelayBadge sec={ov.boardDelay[i]} live={$delaysOk} />{/if}</div>
      <div class="body">
        {#if l.kind === 'walk'}
          <div>🚶 {$t('walkFor', { n: mins(l.depart, l.arrive), m: l.meters })}</div>
          <div class="small muted">→ {l.to.name}</div>
        {:else if l.kind === 'bike'}
          <div>🚲 {$t('bikeFor', { n: mins(l.depart, l.arrive), m: l.meters })} <span class="tag-paid">{$t('paid')}</span></div>
          <div class="small muted">{l.from.name} → {l.to.name}</div>
          <div class="small muted">{$t('bikesNow', { n: l.from.bikes })}</div>
        {:else}
          {#if ov.transferRisk[i]}<p class="risk" role="alert">⚠️ {$t('transferRisk')}</p>{/if}
          <div class="line"><LineBadge routeId={l.routeId} /> <span>{$t('toward', { h: l.headsign })}</span></div>
          <button class="stoplink" onclick={() => navigate({ name: 'stop', stopId: data.stops[l.from].id })}>{stopLabel(l.from)}</button>
          <div class="small muted">{$t('stopsCount', { n: l.stopCount })}</div>
          <div class="arr">
            {formatHM(l.arrive)}<DelayBadge sec={ov.alightDelay[i]} live={$delaysOk} />
            <button class="stoplink" onclick={() => navigate({ name: 'stop', stopId: data.stops[l.to].id })}>{stopLabel(l.to)}</button>
          </div>
        {/if}
      </div>
    </li>
  {/each}
  <li class="leg end"><div class="time">{formatHM(it.arrive)}</div><div class="body">🏁</div></li>
</ol>

<style>
  .legs { list-style: none; margin: 8px 0 0; padding: 0; }
  .leg { display: grid; grid-template-columns: 76px 1fr; gap: 10px; padding: 10px 0; border-left: 4px solid var(--line); padding-left: 10px; }
  .leg.bus { border-left-color: var(--accent); }
  .leg.bike { border-left-color: #2e9d4a; }
  .leg.end { border-left-color: transparent; }
  .time { font-weight: 700; font-variant-numeric: tabular-nums; }
  .line { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
  .stoplink { min-height: 32px; text-align: left; color: var(--accent); font-weight: 600; padding: 0; }
  .arr { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .risk { color: var(--bad); font-weight: 700; margin: 0 0 6px; }
</style>
```

- [ ] **Step 4: Planner.svelte**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { hmToSec, secToHM } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { route, navigate } from '../lib/nav';
  import type { Route } from '../lib/hashRoute';
  import { t } from '../lib/i18n';
  import { bikes, useBikes, useDelays } from '../lib/live';
  import { getLocation } from '../lib/geoloc';
  import { addRecent } from '../lib/places';
  import { planMarkers, focusPoints, highlightLine, tripOverlay, now } from '../lib/ui';
  import { planInWorker } from '../router/client';
  import type { Itinerary, PlanRequest, PlanResult } from '../router/types';
  import PlaceInput from '../components/PlaceInput.svelte';
  import ItineraryCard from '../components/ItineraryCard.svelte';
  import TripDetail from './TripDetail.svelte';

  type PlanRoute = Extract<Route, { name: 'plan' }>;
  let { data }: { data: AppData } = $props();

  const r = $derived($route as PlanRoute);
  let result = $state<PlanResult | null>(null);
  let busy = $state(false);
  let failed = $state(false);
  let locMsg = $state('');

  $effect(() => useBikes());
  $effect(() => useDelays());

  function update(patch: Partial<PlanRoute>) {
    const cur = get(route);
    if (cur.name !== 'plan') return;
    navigate({ ...cur, ...patch, name: 'plan', sel: undefined }, true);
  }

  onMount(() => {
    highlightLine.set(null);
    if (!r.from) {
      getLocation()
        .then((p) => { const cur = get(route); if (cur.name === 'plan' && !cur.from) update({ from: { ...p, name: get(t)('myLocation') } }); })
        .catch((e: Error) => (locMsg = e.message === 'denied' ? get(t)('locationDenied') : get(t)('locationUnavailable')));
    }
  });
  onDestroy(() => { planMarkers.set({}); tripOverlay.set(null); });

  const req = $derived.by((): PlanRequest | null => {
    if (!r.from || !r.to) return null;
    const n = r.mode === 'now' ? $now : null;
    if (n) return { from: r.from, to: r.to, mode: 'dep', date: n.date, sec: n.sec };
    const today = get(now);
    return { from: r.from, to: r.to, mode: r.mode === 'arr' ? 'arr' : 'dep', date: r.date ?? today.date, sec: hmToSec(r.time ?? secToHM(today.sec)) };
  });

  $effect(() => {
    const q = req;
    if (!q) { result = null; return; }
    const b = $bikes;
    let cancelled = false;
    busy = true;
    failed = false;
    planInWorker(q, b)
      .then((res) => { if (cancelled) return; result = res; busy = false; addRecent(q.to); })
      .catch(() => { if (cancelled) return; failed = true; busy = false; });
    return () => { cancelled = true; };
  });

  $effect(() => {
    planMarkers.set({ from: r.from, to: r.to });
    if (r.from && r.to && !r.sel) focusPoints.set([[r.from.lon, r.from.lat], [r.to.lon, r.to.lat]]);
  });

  const selected = $derived.by((): Itinerary | null => {
    if (!result || !r.sel) return null;
    const i = Number(r.sel.slice(1));
    if (r.sel[0] === 'f') return result.free[i] ?? null;
    if (r.sel[0] === 'b') return result.bike[i] ?? null;
    if (r.sel === 'w') return result.walk;
    return null;
  });

  const open = (sel: string) => navigate({ ...r, sel });
  const swap = () => update({ from: r.to, to: r.from });
  function setMode(mode: PlanRoute['mode']) {
    const n = get(now);
    update(mode === 'now' ? { mode, time: undefined, date: undefined } : { mode, time: r.time ?? secToHM(n.sec), date: r.date ?? n.date });
  }
  function shift(minutes: number) {
    const n = get(now);
    const base = r.mode === 'now' ? n.sec : hmToSec(r.time ?? secToHM(n.sec));
    const sec = Math.max(0, Math.min(86340, base + minutes * 60));
    update({ mode: r.mode === 'arr' ? 'arr' : 'dep', time: secToHM(sec), date: r.date ?? n.date });
  }
  const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const fromIso = (s: string) => s.replaceAll('-', '');
</script>

{#if selected}
  <TripDetail it={selected} {data} onBack={() => navigate({ ...r, sel: undefined })} />
{:else}
  <div class="sheet-header">
    <button class="back" aria-label={$t('back')} onclick={() => navigate({ name: 'home' })}>←</button>
    <h1>{$t('whereTo')}</h1>
  </div>

  <div class="fields">
    <div class="inputs">
      <PlaceInput label={$t('from')} value={r.from} stops={data.stops} target="from" onChange={(p) => update({ from: p })} />
      <PlaceInput label={$t('to')} value={r.to} stops={data.stops} target="to" onChange={(p) => update({ to: p })} />
    </div>
    <button class="swap" aria-label={$t('swap')} onclick={swap}>⇅</button>
  </div>
  {#if locMsg && !r.from}<p class="warn small" role="status">{locMsg}</p>{/if}

  <div class="seg" role="group">
    <button aria-pressed={r.mode === 'now'} onclick={() => setMode('now')}>{$t('departNow')}</button>
    <button aria-pressed={r.mode === 'dep'} onclick={() => setMode('dep')}>{$t('departAt')}</button>
    <button aria-pressed={r.mode === 'arr'} onclick={() => setMode('arr')}>{$t('arriveBy')}</button>
  </div>
  {#if r.mode !== 'now'}
    <div class="when">
      <input type="date" aria-label={$t('departAt')} value={isoDate(r.date ?? $now.date)} min={isoDate($now.date)} max={isoDate(data.meta.feedEnd)}
        onchange={(e) => update({ date: fromIso(e.currentTarget.value) })} />
      <input type="time" aria-label={$t('departAt')} value={r.time ?? secToHM($now.sec)} onchange={(e) => update({ time: e.currentTarget.value })} />
    </div>
  {/if}

  {#if busy && !result}<p class="muted" aria-busy="true">{$t('planning')}</p>{/if}
  {#if failed}<p class="error">{$t('loadFailed')}</p>{/if}

  {#if result && r.from && r.to}
    {#if result.nearOrigin === 0}<p class="warn" role="status">{$t('noStopsOrigin')}</p>{/if}
    {#if result.nearDest === 0}<p class="warn" role="status">{$t('noStopsDest')}</p>{/if}

    <h2>🆓 {$t('free')}</h2>
    {#if result.free.length}
      <ul class="list">
        {#each result.free as it, i (i)}<li><ItineraryCard {it} stops={data.stops} today={$now.date} onclick={() => open(`f${i}`)} /></li>{/each}
      </ul>
    {:else}
      <p><strong>{$t('noFreeRoute')}</strong></p>
    {/if}
    <div class="shift">
      <button class="secondary" onclick={() => shift(-30)}>‹ {$t('earlier')}</button>
      <button class="secondary" onclick={() => shift(30)}>{$t('later')} ›</button>
    </div>

    {#if result.bike.length}
      <h2>🚲 {$t('withBike')}</h2>
      <ul class="list">
        {#each result.bike as it, i (i)}<li><ItineraryCard {it} stops={data.stops} today={$now.date} onclick={() => open(`b${i}`)} /></li>{/each}
      </ul>
    {/if}

    {#if result.walk}
      <h2>🚶 {$t('walkOnly')}</h2>
      <ul class="list"><li><ItineraryCard it={result.walk} stops={data.stops} today={$now.date} onclick={() => open('w')} /></li></ul>
    {/if}
  {/if}
{/if}

<style>
  .fields { display: flex; gap: 8px; align-items: center; }
  .inputs { flex: 1; min-width: 0; }
  .swap { width: 44px; font-size: 1.3rem; background: var(--chip); border-radius: 12px; }
  .when { display: flex; gap: 8px; margin-top: 8px; }
  .shift { display: flex; gap: 8px; justify-content: space-between; margin-top: 8px; }
  .warn { color: var(--warn); font-weight: 600; }
  .seg { margin-top: 4px; }
</style>
```

- [ ] **Step 5: Wire into App.svelte**

Add `import Planner from './sheets/Planner.svelte';` and replace `          <!-- SHEET:plan -->` with `          <Planner {data} />`.

- [ ] **Step 6: Typecheck, test, build, try it**

Run: `npm run typecheck -w app && npm test -w app && npm run build -w app`
Expected: no errors.

Manual check (dev server, 390×844, during service hours or with "Odjezd" set to a weekday 07:30): open `#/plan?mode=dep&t=07:30&from=49.981754,14.656433,OÁZA&to=50.010513,14.668653,Pacov`, wait for "🆓 Zdarma" results; every card shows only badges 1/2/3/7/9/91/92; tap the first card → timeline with times, stop names, `bez živých dat` or delays; ← returns to results; ‹ Dříve / Později › shift the time.

- [ ] **Step 7: Commit and push**

```bash
git add -A && git commit -m "feat(app): planner with free/bike/walk results and trip timeline with live delays

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 15: Stop departure board and Nextbike station sheets

**Files:**
- Create: `app/src/sheets/StopBoard.svelte`, `app/src/sheets/BikeStation.svelte`
- Modify: `app/src/App.svelte` (replace `<!-- SHEET:stop -->` and `<!-- SHEET:bike -->`)

**Interfaces:**
- Consumes: `departuresAt` (Task 8), `tripDelay` (Task 8), `netFor` (Task 10), stores, `LineBadge`, `DelayBadge`, `haversine`, `addDays`, `formatHM`.
- Produces: `<StopBoard {data} stopId={string} />` (rows have class `dep`; departures of all platforms sharing the stop name, next 12, refreshed by the 30 s `now` tick and live delays; tomorrow's first departures appended when today runs out); `<BikeStation {data} uid={number} />`.

- [ ] **Step 1: StopBoard.svelte**

```svelte
<script lang="ts">
  import { addDays, formatHM, haversine, LINE_ORDER, type FreeRouteId } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { netFor } from '../lib/network';
  import { departuresAt } from '../router/departures';
  import { tripDelay } from '../router/delays';
  import { delays, delaysOk, useDelays, bikes, useBikes } from '../lib/live';
  import { now, focusPoints, highlightLine, tripOverlay } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';
  import DelayBadge from '../components/DelayBadge.svelte';

  let { data, stopId }: { data: AppData; stopId: string } = $props();
  const LIMIT = 12;

  const stop = $derived(data.stops.find((s) => s.id === stopId) ?? null);
  const group = $derived(stop ? data.stops.flatMap((s, i) => (s.name === stop.name ? [i] : [])) : []);
  const lines = $derived(LINE_ORDER.filter((l) => group.some((i) => data.stops[i].lines.includes(l))) as FreeRouteId[]);

  $effect(() => useDelays());
  $effect(() => useBikes());
  $effect(() => {
    tripOverlay.set(null);
    highlightLine.set(null);
    if (stop) focusPoints.set([[stop.lon, stop.lat]]);
  });

  const deps = $derived.by(() => {
    const n = $now;
    const collect = (date: string, from: number, day: number) =>
      group.flatMap((i) => departuresAt(netFor(data, date), i, from, LIMIT).map((d) => ({ ...d, stop: i, day })));
    const today = collect(n.date, n.sec - 60, 0).sort((a, b) => a.dep - b.dep).slice(0, LIMIT);
    if (today.length >= LIMIT) return today;
    const tomorrow = collect(addDays(n.date, 1), 0, 1).sort((a, b) => a.dep - b.dep).slice(0, LIMIT - today.length);
    return [...today, ...tomorrow];
  });

  const nearestBike = $derived.by(() => {
    if (!stop || !$bikes?.length) return null;
    return $bikes.map((b) => ({ b, m: Math.round(haversine(stop.lat, stop.lon, b.lat, b.lon)) })).sort((x, y) => x.m - y.m)[0];
  });

  function whenLabel(dep: number, delay: number | null, day: number): string {
    if (day > 0) return $t('tomorrow');
    const diff = Math.round((dep + (delay ?? 0) - $now.sec) / 60);
    if (diff <= 0) return $t('nowShort');
    return diff < 60 ? $t('inMin', { n: diff }) : '';
  }
  const here = () => (stop ? { lat: stop.lat, lon: stop.lon, name: stop.name } : undefined);
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => history.length > 1 ? history.back() : navigate({ name: 'home' })}>←</button>
  <h1>{stop ? `🚏 ${stop.name}` : $t('stopNotFound')}</h1>
</div>

{#if stop}
  <div class="chips">
    {#each lines as l (l)}
      <button class="line" aria-label={`${$t('lines')} ${l}`} onclick={() => navigate({ name: 'line', number: data.lines.find((x) => x.routeId === l)?.number ?? '', dir: 0, stopId: stop.id })}><LineBadge routeId={l} /></button>
    {/each}
    <span class="spacer"></span>
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', from: here() })}>{$t('planFromHere')}</button>
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', to: here() })}>{$t('planToHere')}</button>
  </div>

  <h2>{$t('departures')}</h2>
  {#if !deps.length || deps[0].day > 0}<p class="muted">{$t('noMoreToday')}</p>{/if}
  <ul class="list">
    {#each deps as d (`${d.tripId}-${d.serviceDate}-${d.stop}`)}
      {@const delay = d.day === 0 ? tripDelay($delays, d.tripId, d.serviceDate, d.seq) : null}
      <li class="dep">
        <span class="time">{formatHM(d.dep)}</span>
        <LineBadge routeId={d.routeId} />
        <span class="head">{d.headsign}{#if data.stops[d.stop].platform}<small class="muted"> · {data.stops[d.stop].platform}</small>{/if}</span>
        <span class="when">{whenLabel(d.dep, delay, d.day)}{#if d.day === 0}<DelayBadge sec={delay} live={$delaysOk} />{/if}</span>
      </li>
    {/each}
  </ul>

  {#if nearestBike}
    <h2>{$t('nearestBike')}</h2>
    <button class="row bike" onclick={() => navigate({ name: 'bike', uid: nearestBike.b.uid })}>
      🚲 {nearestBike.b.name} · {$t('bikesAvailable', { n: nearestBike.b.bikes })} · {nearestBike.m} m
    </button>
  {/if}
{/if}

<style>
  .line { min-width: 44px; display: grid; place-items: center; }
  .spacer { flex: 1; }
  .dep { display: grid; grid-template-columns: 52px auto 1fr auto; gap: 10px; align-items: center; padding: 10px 2px; }
  .time { font-weight: 700; font-variant-numeric: tabular-nums; }
  .head { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { font-size: 0.85rem; color: var(--muted); text-align: right; white-space: nowrap; }
  .bike { width: 100%; text-align: left; background: var(--chip); border-radius: 12px; padding: 0 12px; }
</style>
```

- [ ] **Step 2: BikeStation.svelte**

```svelte
<script lang="ts">
  import { haversine } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { bikes, bikesOk, bikesAt, useBikes } from '../lib/live';
  import { focusPoints, tripOverlay, highlightLine } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t, lang } from '../lib/i18n';

  let { data, uid }: { data: AppData; uid: number } = $props();
  $effect(() => useBikes());
  const st = $derived($bikes?.find((b) => b.uid === uid) ?? null);
  $effect(() => {
    tripOverlay.set(null);
    highlightLine.set(null);
    if (st) focusPoints.set([[st.lon, st.lat]]);
  });
  const nearStops = $derived(st
    ? data.stops.map((s) => ({ s, m: Math.round(haversine(st.lat, st.lon, s.lat, s.lon)) })).sort((a, b) => a.m - b.m)
        .filter((x, i, arr) => arr.findIndex((y) => y.s.name === x.s.name) === i).slice(0, 3)
    : []);
  const updated = $derived($bikesAt ? new Date($bikesAt).toLocaleTimeString($lang === 'cs' ? 'cs-CZ' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  const here = () => (st ? { lat: st.lat, lon: st.lon, name: st.name } : undefined);
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => history.length > 1 ? history.back() : navigate({ name: 'home' })}>←</button>
  <h1>🚲 {st?.name ?? $t('bikes')}</h1>
</div>

{#if st}
  <p class="big-num"><strong>{$t('bikesAvailable', { n: st.bikes })}</strong> · {$t('freeRacks', { n: st.freeRacks })}</p>
  {#if updated}<p class="muted small">{$t('updatedAt', { t: updated })}</p>{/if}
  <p class="muted small">{$t('paid')} · <a href="https://www.nextbikeczech.com/" target="_blank" rel="noopener">{$t('openNextbike')}</a></p>
  <div class="chips">
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', from: here() })}>{$t('planFromHere')}</button>
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', to: here() })}>{$t('planToHere')}</button>
  </div>
  <h2>🚏</h2>
  <ul class="list">
    {#each nearStops as x (x.s.id)}<li><button class="row" onclick={() => navigate({ name: 'stop', stopId: x.s.id })}>{x.s.name} · {x.m} m</button></li>{/each}
  </ul>
{:else if !$bikesOk}
  <p class="warn">{$t('bikeUnavailable')}</p>
{:else if $bikes}
  <p>{$t('stationNotFound')}</p>
{:else}
  <p class="muted" aria-busy="true">{$t('loading')}</p>
{/if}

<style>
  .big-num { font-size: 1.1rem; }
  .warn { color: var(--warn); }
</style>
```

- [ ] **Step 3: Wire into App.svelte**

Add imports `import StopBoard from './sheets/StopBoard.svelte';` and `import BikeStation from './sheets/BikeStation.svelte';`. Replace `          <!-- SHEET:stop -->` with `          <StopBoard {data} stopId={$route.stopId} />` and `          <!-- SHEET:bike -->` with `          <BikeStation {data} uid={$route.uid} />`.
(Svelte narrows `$route` inside the `{#if $route.name === 'stop'}` branch; if svelte-check complains, use `{($route as { stopId: string }).stopId}` and `{($route as { uid: number }).uid}`.)

- [ ] **Step 4: Typecheck, test, build, try it**

Run: `npm run typecheck -w app && npm test -w app && npm run build -w app`
Manual: open `#/stop/<an id from stops.json for "Masarykovo nám.">` → departures list with line badges and "za N min"; nearest Nextbike row; tap it → station sheet with counts. Tap a stop dot on the map → board opens.

- [ ] **Step 5: Commit and push**

```bash
git add -A && git commit -m "feat(app): live stop departure boards and Nextbike station details

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 16: Line view (route on map, stop list, stop timetable by hour)

**Files:**
- Create: `app/src/sheets/LineView.svelte`
- Modify: `app/src/App.svelte` (replace `<!-- SHEET:line -->`)

**Interfaces:**
- Consumes: `sampleDate`, `stopTimetable`, `dayTypeOf`, `DayType` (Task 8), stores, `LineBadge`, `navigate`.
- Produces: `<LineView {data} number={string} dir={number} stopId={string | undefined} />` — timetable rows have class `tt-row`; stop list items are buttons.

- [ ] **Step 1: LineView.svelte**

```svelte
<script lang="ts">
  import type { AppData } from '../lib/data';
  import { sampleDate, stopTimetable, dayTypeOf, type DayType } from '../router/timetable';
  import { now, focusPoints, highlightLine, tripOverlay } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';

  let { data, number, dir, stopId }: { data: AppData; number: string; dir: number; stopId: string | undefined } = $props();

  const line = $derived(data.lines.find((l) => l.number === number) ?? null);
  const direction = $derived(line ? (line.directions.find((d) => d.directionId === dir) ?? line.directions[0]) : null);
  let dayType = $state<DayType>(dayTypeOf($now.date));
  const date = $derived(sampleDate(data.timetable, dayType, $now.date));
  const selIdx = $derived.by(() => {
    if (!direction) return -1;
    const i = stopId ? data.stops.findIndex((s) => s.id === stopId) : -1;
    return direction.stops.includes(i) ? i : direction.stops[0];
  });
  const table = $derived(line && direction && date && selIdx >= 0 ? [...stopTimetable(data.timetable, line.routeId, direction.directionId, selIdx, date)] : []);

  $effect(() => {
    if (!line || !direction) return;
    tripOverlay.set(null);
    highlightLine.set(line.routeId);
    focusPoints.set(direction.shape);
    return () => highlightLine.set(null);
  });

  const setDir = (d: number) => navigate({ name: 'line', number, dir: d }, true);
  const setStop = (i: number) => navigate({ name: 'line', number, dir: direction?.directionId ?? 0, stopId: data.stops[i].id }, true);
  const DAYS: DayType[] = ['weekday', 'saturday', 'sunday'];
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => history.length > 1 ? history.back() : navigate({ name: 'home' })}>←</button>
  {#if line}<LineBadge routeId={line.routeId} /><h1 class="ln">{line.longName}</h1>{:else}<h1>{$t('lineNotFound')}</h1>{/if}
</div>

{#if line && direction}
  {#if line.directions.length > 1}
    <div class="seg" role="group">
      {#each line.directions as d (d.directionId)}
        <button aria-pressed={d.directionId === direction.directionId} onclick={() => setDir(d.directionId)}>→ {d.headsign}</button>
      {/each}
    </div>
  {/if}

  <h2>{data.stops[selIdx]?.name}</h2>
  <div class="seg" role="group">
    {#each DAYS as d (d)}<button aria-pressed={dayType === d} onclick={() => (dayType = d)}>{$t(d)}</button>{/each}
  </div>
  {#if table.length}
    <div class="tt" role="table">
      {#each table as [h, mins] (h)}
        <div class="tt-row" role="row"><span class="h" role="rowheader">{h}</span><span class="m" role="cell">{mins.map((m) => String(m).padStart(2, '0')).join('  ')}</span></div>
      {/each}
    </div>
  {:else}
    <p class="muted">{$t('noService')}</p>
  {/if}

  <h2>🚏</h2>
  <ol class="stops">
    {#each direction.stops as i (i)}
      <li><button class:sel={i === selIdx} onclick={() => setStop(i)}>{data.stops[i].name}{#if data.stops[i].platform}<small class="muted"> · {data.stops[i].platform}</small>{/if}</button></li>
    {/each}
  </ol>
{/if}

<style>
  .ln { font-size: 1rem; }
  .seg { margin-top: 8px; }
  .tt { display: grid; gap: 2px; margin-top: 8px; font-variant-numeric: tabular-nums; }
  .tt-row { display: grid; grid-template-columns: 36px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--line); }
  .h { font-weight: 800; text-align: right; }
  .m { white-space: pre-wrap; }
  .stops { margin: 0; padding-left: 22px; }
  .stops button { min-height: 40px; text-align: left; }
  .stops button.sel { font-weight: 800; color: var(--accent); }
</style>
```

- [ ] **Step 2: Wire into App.svelte**

Add `import LineView from './sheets/LineView.svelte';` and replace `          <!-- SHEET:line -->` with `          <LineView {data} number={$route.number} dir={$route.dir} stopId={$route.stopId} />` (same narrowing note as Task 15).

- [ ] **Step 3: Typecheck, test, build, try it**

Run: `npm run typecheck -w app && npm test -w app && npm run build -w app`
Manual: `#/line/3` → line 3 highlighted on the map, direction toggle, Po–Pá/So/Ne tabs, hour rows for the first stop; tap another stop → its times; `Ne` shows "V tento den linka nejede".

- [ ] **Step 4: Commit and push**

```bash
git add -A && git commit -m "feat(app): line view with stop list and per-stop timetable by hour

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

---

### Task 17: End-to-end tests, CI e2e, final verification and hand-off

**Files:**
- Create: `app/playwright.config.ts`, `app/e2e/fixtures.ts`, `app/e2e/app.spec.ts`
- Modify: `.github/workflows/ci.yml` (add e2e job), `.gitignore`, `README.md`
- Create: `docs/verification.md`

**Interfaces:**
- Consumes: the whole app; `app/public/data/*.json`.
- Produces: green CI with e2e; a deployed, verified site; `docs/verification.md` recording the checks.

- [ ] **Step 1: Playwright config and fixtures**

`app/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173/ricany-bus/',
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/ricany-bus/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

`app/e2e/fixtures.ts`:
```ts
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Stop = { id: string; name: string; lat: number; lon: number; lines: string[] };
type Line = { routeId: string; number: string; directions: { directionId: number; stops: number[] }[] };
const read = <T>(n: string): T => JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), 'utf8')) as T;

export const stops = read<{ stops: Stop[] }>('stops').stops;
export const lines = read<{ lines: Line[] }>('lines').lines;
const services = read<{ servicesByDate: Record<string, string[]> }>('timetable').servicesByDate;

const isWeekday = (d: string) => { const w = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay(); return w >= 1 && w <= 5; };
export const DATE = Object.keys(services).sort().find((d) => isWeekday(d) && services[d].length)!;

function pragueUtc(date: string, hh: number, mm: number): Date {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), hh, mm);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', hourCycle: 'h23' });
  for (const off of [1, 2]) {
    const d = new Date(guess - off * 3600_000);
    if (Number(fmt.format(d)) === hh) return d;
  }
  throw new Error('cannot resolve Prague offset');
}

const first = stops[lines[0].directions[0].stops[0]];
export const NEXTBIKE = { countries: [{ cities: [{ uid: 736, places: [
  { uid: 111, name: 'Test stanice', lat: first.lat + 0.0005, lng: first.lon, spot: true, maintenance: false, active_place: 1, bikes: 4, bikes_available_to_rent: 4, free_racks: 6 },
] }] }] };
const PHOTON = { features: [{ geometry: { coordinates: [14.6556, 49.9918] }, properties: { name: 'Testovací náměstí', city: 'Říčany' } }] };
const STYLE = { version: 8, glyphs: 'https://glyphs.invalid/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef2f5' } }] };

export const test = base.extend<{ mocks: void; delaysStatus: number }>({
  delaysStatus: [200, { option: true }],
  mocks: [async ({ page, delaysStatus }, use) => {
    await page.route('https://tiles.openfreemap.org/**', (r) => (r.request().url().includes('/styles/') ? r.fulfill({ json: STYLE }) : r.abort()));
    await page.route('https://glyphs.invalid/**', (r) => r.abort());
    await page.route('https://api.nextbike.net/**', (r) => r.fulfill({ json: NEXTBIKE }));
    await page.route('https://photon.komoot.io/**', (r) => r.fulfill({ json: PHOTON }));
    await page.route('https://ricany-bus-live.pokeypoke.workers.dev/**', (r) =>
      delaysStatus === 200 ? r.fulfill({ json: { generatedAt: 1, trips: {} } }) : r.fulfill({ status: delaysStatus, json: { error: 'down' } }));
    await page.clock.setFixedTime(pragueUtc(DATE, 7, 30));
    await use();
  }, { auto: true }],
});
export { expect };
export const place = (s: Stop) => `${s.lat},${s.lon},${encodeURIComponent(s.name)}`;
```

- [ ] **Step 2: Write the e2e specs**

`app/e2e/app.spec.ts`:
```ts
import { test, expect, stops, lines, place } from './fixtures';

const line1 = lines.find((l) => l.number === '1')!;
const a = stops[line1.directions[0].stops[0]];
const b = stops[line1.directions[0].stops[line1.directions[0].stops.length - 1]];
const busiest = [...stops].sort((x, y) => y.lines.length - x.lines.length)[0];

test('home shows search, saved places and the 7 free lines', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /Kam jedete/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Linky \d+$/ })).toHaveCount(7);
  await expect(page.getByRole('button', { name: /Přidat místo/ })).toBeVisible();
});

test('language switch to English persists across reloads', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: /Where to\?/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Where to\?/ }).first()).toBeVisible();
});

test('plans a free-only trip and opens its timeline', async ({ page }) => {
  await page.goto(`./#/plan?mode=now&from=${place(a)}&to=${place(b)}`);
  await expect(page.getByRole('heading', { name: /Zdarma/ })).toBeVisible();
  const card = page.locator('.card').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.tag-free')).toBeVisible();
  await card.click();
  await expect(page.getByRole('button', { name: 'Zpět' })).toBeVisible();
  await expect(page.locator('.leg.bus').first()).toBeVisible();
});

test.describe('with location', () => {
  test.use({ geolocation: { latitude: a.lat, longitude: a.lon }, permissions: ['geolocation'] });
  test('≤ 3 taps: search a stop from my location', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /Kam jedete/ }).first().click(); // tap 1
    await page.getByLabel('Kam', { exact: true }).fill(b.name.slice(0, 6));  // typing
    await page.getByRole('button', { name: new RegExp(b.name.slice(0, 6)) }).first().click(); // tap 2
    await expect(page).toHaveURL(/from=.*to=/);
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 15_000 });
  });
});

test('stop board lists departures and the nearest bike', async ({ page }) => {
  await page.goto(`./#/stop/${busiest.id}`);
  await expect(page.getByRole('heading', { name: new RegExp(busiest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  await expect(page.locator('.dep').first()).toBeVisible();
});

test.describe('live data down', () => {
  test.use({ delaysStatus: 503 });
  test('shows the no-live-data marker', async ({ page }) => {
    await page.goto(`./#/stop/${busiest.id}`);
    await expect(page.getByText('bez živých dat').first()).toBeVisible({ timeout: 10_000 });
  });
});

test('line view shows a per-stop timetable', async ({ page }) => {
  await page.goto('./#/line/3');
  await expect(page.getByRole('button', { name: 'Po–Pá' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tt-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ne', exact: true }).click();
  await expect(page.getByText('V tento den linka nejede')).toBeVisible();
});

test('saved place persists', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Přidat místo/ }).click();
  await page.getByLabel('Název').fill('Domů');
  await page.getByLabel('Adresa, místo nebo zastávka').fill(b.name.slice(0, 6));
  await page.getByRole('button', { name: new RegExp(b.name.slice(0, 6)) }).first().click();
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('button', { name: /🏠 Domů/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /🏠 Domů/ })).toBeVisible();
});

test('explains when no stop is near the start', async ({ page }) => {
  await page.goto(`./#/plan?mode=now&from=49.9,14.65,Daleko&to=${place(b)}`);
  await expect(page.getByText(/Do 1,2 km od výchozího místa/)).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 3: Run e2e locally**

```bash
cd app && npx playwright install chromium && cd ..
npm run e2e -w app
```
Expected: 9 passed. On failure, open the trace (`npx playwright show-trace app/test-results/**/trace.zip`) and fix the app, not the assertions — unless an assertion contradicts the spec.

- [ ] **Step 4: CI e2e job and ignores**

Append to `.github/workflows/ci.yml` under `jobs:`:
```yaml
  e2e:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
        working-directory: app
      - run: npm run e2e -w app
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: app/playwright-report }
```
Append to `.gitignore`:
```
app/test-results/
app/playwright-report/
```

- [ ] **Step 5: Push and verify CI + deploy**

```bash
git add -A && git commit -m "test(app): Playwright e2e on a phone viewport with mocked externals; CI e2e job

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
gh run watch --exit-status $(gh run list --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch --exit-status $(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: both succeed.

- [ ] **Step 6: Live verification on the deployed site**

Using Claude-in-Chrome (load its tools in one ToolSearch call; new tab; 390×844 window) on `https://pokeypoke.github.io/ricany-bus/`:
1. Home renders with map tiles, colored lines, Nextbike dots with counts.
2. Plan `OÁZA → Pacov` (or any two stops on different lines): only free badges; open a trip; live delay badges show (`±0 min`/`+N min`) during service hours.
3. A stop board shows "za N min" countdowns.
4. `#/line/1` timetable renders.
5. EN toggle works.
6. `curl -s https://ricany-bus-live.pokeypoke.workers.dev/delays | head -c 200` returns JSON.
Record a GIF with `gif_creator` named `ricany-bus-walkthrough.gif`.

- [ ] **Step 7: Cross-check against an official timetable**

Search the web for the official MHD Říčany timetable PDF for line 3 (e.g. on `ricany.cz`; queries like `MHD Říčany linka 3 jízdní řád`). If found, pick the line's first stop for weekdays and compare its first 5 and last 2 departures with the app's line view for the same stop and day type. If no PDF is reachable, compare instead with `https://pid.cz/zastavkove-jizdni-rady/` or the IDOS/`idos.cz` timetable for the same stop. Record the source URL, the stop, both lists, and match/mismatch in `docs/verification.md`. A mismatch means the pipeline is wrong (or the feed differs from the PDF validity period) — investigate before finishing.

`docs/verification.md` template:
```markdown
# Stage A verification — <date>

## Automated
- Unit tests: <count> passed (`npm test`)
- Golden RAPTOR vs brute force on real data: passed
- E2E (Pixel 7 viewport): 9 passed
- CI: <run URL>  ·  Deploy: <run URL>

## Live site
- URL: https://pokeypoke.github.io/ricany-bus/ — checks 1–6: <results>
- Walkthrough GIF: ricany-bus-walkthrough.gif

## Timetable cross-check
- Source: <URL>
- Line / stop / day type: <…>
- Official: <times>
- App: <times>
- Result: <match | mismatch + explanation>

## Definition of done (spec §8)
1. ≤ 3 taps from my location to free-only results: <evidence>
2. Departure board for every stop; map view + timetable for every line: <evidence>
3. Nextbike live counts; bike trips in a separate paid section: <evidence>
4. Czech + English; saved places persist; installable PWA; offline timetables: <evidence>
5. Nightly refresh with zero manual steps; bad feed never breaks the site: refresh-data.yml run <URL>; validation gate tests
6. Golden trips match official timetable: <evidence>
```

Offline check for item 4: in Chrome DevTools-free form — load the site once, then use Claude-in-Chrome's network emulation is not available, so instead verify the service worker exists: `curl -s https://pokeypoke.github.io/ricany-bus/sw.js | head -c 100` and confirm `rb-data` appears in it.

- [ ] **Step 8: Final commit and push**

```bash
git add -A && git commit -m "docs: stage A verification record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push
```

- [ ] **Step 9: Hand-off note**

Update the project memory file `project-ricany-bus-status.md` (memory dir from the system prompt) to "Stage A shipped <date>; next: Stage B (live bus positions via Worker /positions, public polish)". Append any papercuts hit during the build to `~/code/papercuts.md`. Report to the owner: site URL, Worker URL, CI status, the verification doc, and anything that could not be verified.

---

## Self-review notes (planning)

- Spec coverage: §2 sources → Tasks 2–4, 11; §3.1 pipeline + validation gate → Tasks 2–3, nightly → Task 10; §3.2 Worker → Task 4; §3.3 client/offline → Tasks 10–11; §4 routing (walk, transfers, RAPTOR, arrive-by, rollover, bike legs, grouping, delays, speed) → Tasks 5–9; §5 UI (map, sheets, saved places, i18n, deep links, PWA, a11y, dark mode) → Tasks 10–16; §6 errors → Tasks 3, 6, 11, 14–15, 17; §7 testing → every task + Task 9 + Task 17; §8 DoD → Task 17 verification doc.
- Deviation from spec: arrive-by uses repeated forward RAPTOR (spec updated to match).
- Known Stage A limitations (by design): straight-line walking/cycling; bike availability is a snapshot; map tiles cached only where viewed.
