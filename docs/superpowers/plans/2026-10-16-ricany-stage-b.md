# Říčany Free Bus Router — Stage B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live buses on the map, readable stop markers linked to the line view, a "Kam pojedete?" direct-ride flow, a hardened live-data Worker, and public/pitch polish — on top of the shipped Stage A app.

**Architecture:** Same monorepo. Worker gains a byte-level pre-filter, `/positions`, stale-on-error and a GitHub deploy workflow. Pipeline emits `groups.json` (stops merged by name). App gains map layers (ring stop markers, numbered line stops, buses), new sheets (Bus, From/"Kam pojedete?", Ride, About), and router helpers (`directRides`, `downstreamStops`).

**Tech Stack:** unchanged (TypeScript 5.x, Svelte 5 runes, Vite 8, vite-plugin-pwa, maplibre-gl 6, Vitest, Playwright, Cloudflare Workers via `npx --yes wrangler@4`).

**Spec:** `docs/superpowers/specs/2026-10-16-ricany-stage-b-design.md` (binding), on top of `docs/superpowers/specs/2026-10-15-ricany-free-bus-design.md`.

## Autonomy rules (owner not available)

Same as Stage A: pre-authorized to push to `main` of `PokeyPoke/ricany-bus`, deploy GitHub Pages and the Cloudflare Worker `ricany-bus-live` from this Mac. Nothing else outward-facing. `git pull --rebase` before starting each task (a nightly bot commits `app/public/data`). Commit trailer: the Co-Authored-By line your environment instructs. Check `~/code/papercuts.md` when tooling misbehaves; append when you lose time. npm 10 crashes on this repo's workspace installs — if a dependency is truly needed use `npx npm@11 install …` (none are planned). TypeScript stays 5.x.

## Global Constraints

- Free lines selected only by route_id `L1731…L1737`; display numbers 1,2,3,7,9,91,92; colours from `LINE_STYLE`.
- Worker endpoints: `/delays` (unchanged JSON) and `/positions`; CORS `*`; `Cache-Control: public, max-age=15`; memo TTL 15 s; stale-on-error ≤ 120 s with header `X-Stale: 1`; upstream timeout 8 s.
- Pre-filter needle: ASCII `L173` in a top-level FeedEntity's raw bytes.
- Positions considered stale after 3 min (`ts`); bus poller 15 s; all pollers pause while `document.hidden`.
- Stop group id = id of its first platform (platform ids sorted ascending); group name = platform display name.
- Stop names from zoom 14; tap targets ≥ 44 px.
- Routes added: `#/bus/:tripId`, `#/from/:groupId?line=&dir=`, `#/ride?line=&dir=&from=&to=`, `#/about`.
- Gate: ≥ 3 of the next 10 days have a service id with trips.
- CI: Node 22, `runs-on: ubuntu-24.04`.
- No analytics or tracking.
- Keep all Stage A e2e selectors/labels working: `.card`, `.tag-free`, `.leg.bus`, `.dep`, `.tt-row`, 'Zpět', 'Kam', 'Název', 'Uložit', 'Po–Pá', 'Ne', 'English', 'bez živých dat' on the stop board when the Worker is down, `button.bike` "Test stanice".

## Review Focus

1. **Bus feed lists a trip from yesterday's service day still running after midnight** — bus sheet must look it up by `startDate`, not today's date. Test: Task 4 `freshVehicles keeps vehicles and resolveVehicleTrip uses startDate`.
2. **Upstream returns 200 with a truncated/garbage body** — Worker must not cache and serve a partial decode as fresh for 15 s; must 503 or serve stale. Test: Task 1 `garbage body is treated as upstream failure`.
3. **Line view opened on a stop that is only on one branch pattern** — numbered markers and downstream list must still be consistent with the list order. Test: Task 4 `downstreamStops on a branch pattern`.
4. **Tab returns from background after an hour** — pollers must refresh immediately, not show hour-old buses. Test: Task 6 `poller pauses while hidden and ticks on return`.
5. **Offline after first visit, then a nightly data update** — app keeps working offline with the precached data and picks the new data up once online. Test: Task 10 e2e `planner works offline after first visit`.

## File Structure (new/changed)

```
shared/src/types.ts                      + Vehicle, PositionsResponse, StopGroup, GroupsFile; StopRec.group
worker/src/prefilter.ts                  NEW byte-level entity pre-filter
worker/src/pb.ts                         + float32, decodeVehiclePositions
worker/src/filter.ts                     + filterPositions
worker/src/index.ts                      routes table, stale-on-error, timeout
worker/test/{prefilter,positions,handler}.test.ts, worker/test/fixture/vehicle_positions.pb
.github/workflows/worker.yml             NEW deploy on push (skips without secret)
.github/workflows/{ci,deploy,refresh-data}.yml  Node 22 / ubuntu-24.04
pipeline/src/build.ts, validate.ts       groups.json, StopRec.group, new gate
app/src/lib/data.ts                      AppData.groups
app/src/router/directRides.ts            NEW directRides, downstreamStops
app/src/lib/live.ts                      positions poller, visibility pause, freshVehicles
app/src/map/rings.ts                     NEW ring segments + canvas icon drawing
app/src/map/geojson.ts                   + groupsGeoJson, lineStopsGeoJson, busesGeoJson
app/src/map/layers.ts, MapView.svelte    group markers, numbered line stops, buses, hover state, style fallback
app/src/lib/ui.ts                        + hoverGroup, lineSelection
app/src/lib/hashRoute.ts                 + bus/from/ride/about routes
app/src/sheets/{BusSheet,FromSheet,RideSheet,About}.svelte  NEW
app/src/sheets/{LineView,StopBoard,TripDetail,Planner}.svelte  changes
app/src/components/PlaceInput.svelte     ARIA combobox
app/src/lib/i18n.ts                      new keys
app/vite.config.ts                       precache data/*.json
app/public/icons/icon.svg, app/public/og.png, app/scripts/og.mjs, app/index.html meta
app/e2e/stage-b.spec.ts                  NEW
docs/verification-b.md                   NEW
```

---

### Task 1: Worker — pre-filter, `/positions`, stale-on-error, timeout

**Files:** Create `worker/src/prefilter.ts`, `worker/test/prefilter.test.ts`, `worker/test/positions.test.ts`, `worker/test/fixture/vehicle_positions.pb`. Modify `worker/src/pb.ts`, `worker/src/filter.ts`, `worker/src/index.ts`, `worker/test/handler.test.ts`, `shared/src/types.ts`.

**Interfaces:**
- Produces (shared): `interface Vehicle { id: string; label: string; tripId: string; routeId: FreeRouteId; startDate: string; lat: number; lon: number; bearing: number | null; speed: number | null; stopSeq: number | null; ts: number }`, `interface PositionsResponse { generatedAt: number; vehicles: Vehicle[] }`.
- Produces (worker): `prefilter(buf: Uint8Array, needle?: Uint8Array): Uint8Array`; `decodeVehiclePositions(buf): { timestamp: number; vehicles: RawVehicle[] }`; `filterPositions(feed): PositionsResponse`; `createHandler(deps: { fetchUpstream: (url: string, signal: AbortSignal) => Promise<Response>; now: () => number })`.

- [ ] **Step 1: Capture the positions fixture** (service hours): `curl -sSf -o "$TMPDIR/vp.pb" https://api.golemio.cz/v2/vehiclepositions/gtfsrt/vehicle_positions.pb && node worker/scripts/make-fixture.mjs "$TMPDIR/vp.pb" worker/test/fixture/vehicle_positions.pb` → expect `kept N free + 40 other` with N ≥ 1 (retry later if 0).

- [ ] **Step 2: Shared types** — append to `shared/src/types.ts`:
```ts
export interface Vehicle {
  id: string; label: string; tripId: string; routeId: FreeRouteId; startDate: string;
  lat: number; lon: number; bearing: number | null; speed: number | null; stopSeq: number | null;
  /** unix seconds of the position */
  ts: number;
}
export interface PositionsResponse { generatedAt: number; vehicles: Vehicle[] }
```

- [ ] **Step 3: Failing tests**

`worker/test/prefilter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { prefilter } from '../src/prefilter';
import { decodeTripUpdates, decodeVehiclePositions } from '../src/pb';
import { filterDelays, filterPositions } from '../src/filter';

const tu = new Uint8Array(readFileSync(new URL('./fixture/trip_updates.pb', import.meta.url)));
const vp = new Uint8Array(readFileSync(new URL('./fixture/vehicle_positions.pb', import.meta.url)));

describe('prefilter', () => {
  it('keeps the header and only entities containing L173 — same filtered output as a full decode', () => {
    const small = prefilter(tu);
    expect(small.length).toBeLessThan(tu.length);
    expect(filterDelays(decodeTripUpdates(small))).toEqual(filterDelays(decodeTripUpdates(tu)));
    expect(decodeTripUpdates(small).timestamp).toBe(decodeTripUpdates(tu).timestamp);
    expect(filterPositions(decodeVehiclePositions(prefilter(vp)))).toEqual(filterPositions(decodeVehiclePositions(vp)));
  });
  it('is fast on a large feed', () => {
    const big = new Uint8Array(tu.length * 10);
    for (let i = 0; i < 10; i++) big.set(tu, i * tu.length);
    const t = performance.now();
    prefilter(big);
    expect(performance.now() - t).toBeLessThan(50);
  });
  it('throws on truncated input', () => {
    expect(() => prefilter(tu.subarray(0, tu.length - 7))).toThrow();
  });
});
```
(The 10× repeated buffer contains 10 headers; prefilter must not choke on that — it just keeps them.)

`worker/test/positions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeVehiclePositions } from '../src/pb';
import { filterPositions } from '../src/filter';

const vp = new Uint8Array(readFileSync(new URL('./fixture/vehicle_positions.pb', import.meta.url)));

describe('positions', () => {
  it('decodes free-line vehicles with coordinates in Říčany', () => {
    const r = filterPositions(decodeVehiclePositions(vp));
    expect(r.generatedAt).toBeGreaterThan(1.7e9);
    expect(r.vehicles.length).toBeGreaterThan(0);
    for (const v of r.vehicles) {
      expect(v.routeId).toMatch(/^L173[1-7]$/);
      expect(v.lat).toBeGreaterThan(49.9); expect(v.lat).toBeLessThan(50.1);
      expect(v.lon).toBeGreaterThan(14.5); expect(v.lon).toBeLessThan(14.8);
      expect(v.tripId).toMatch(/^173[1-7]_/);
      expect(v.startDate).toMatch(/^\d{8}$/);
      expect(v.ts).toBeGreaterThan(1.7e9);
    }
  });
});
```

Extend `worker/test/handler.test.ts` (replace `createHandler` usage so `fetchUpstream` takes `(url, signal)`; keep the 4 existing tests' intent) and add:
```ts
it('serves /positions', async () => {
  const vpBuf = readFileSync(new URL('./fixture/vehicle_positions.pb', import.meta.url));
  const h = createHandler({ fetchUpstream: async (url) => new Response(url.includes('vehicle_positions') ? vpBuf : pb), now: () => 0 });
  const res = await h(req('/positions'));
  expect(res.status).toBe(200);
  expect((await res.json()).vehicles.length).toBeGreaterThan(0);
});
it('serves stale data with X-Stale for up to 120 s when upstream fails', async () => {
  let t = 0; let fail = false;
  const h = createHandler({ fetchUpstream: async () => (fail ? new Response('x', { status: 502 }) : new Response(pb)), now: () => t });
  await h(req('/delays'));
  fail = true; t = 60_000;
  const stale = await h(req('/delays'));
  expect(stale.status).toBe(200);
  expect(stale.headers.get('x-stale')).toBe('1');
  t = 130_000;
  expect((await h(req('/delays'))).status).toBe(503);
});
it('garbage body is treated as upstream failure', async () => {
  const h = createHandler({ fetchUpstream: async () => new Response(new Uint8Array([0x12, 0xff, 0xff, 0x03, 0x01])), now: () => 0 });
  expect((await h(req('/delays'))).status).toBe(503);
});
it('times out a hung upstream', async () => {
  const h = createHandler({ fetchUpstream: (_u, signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))), now: () => 0, timeoutMs: 20 });
  expect((await h(req('/delays'))).status).toBe(503);
});
```
(`createHandler` deps accept optional `timeoutMs`, default 8000.)

- [ ] **Step 4: RED** — `npm test -w worker` fails (missing modules/exports).

- [ ] **Step 5: Implement**

`worker/src/prefilter.ts`:
```ts
const NEEDLE = new TextEncoder().encode('L173');

function contains(buf: Uint8Array, start: number, end: number, needle: Uint8Array): boolean {
  const n0 = needle[0], last = end - needle.length;
  outer: for (let i = start; i <= last; i++) {
    if (buf[i] !== n0) continue;
    for (let k = 1; k < needle.length; k++) if (buf[i + k] !== needle[k]) continue outer;
    return true;
  }
  return false;
}

/** Copies the FeedHeader and only those top-level FeedEntity fields whose bytes contain `needle`. */
export function prefilter(buf: Uint8Array, needle: Uint8Array = NEEDLE): Uint8Array {
  const keep: [number, number][] = [];
  let pos = 0, total = 0;
  const varint = () => {
    let r = 0, s = 0, b: number;
    do {
      if (pos >= buf.length) throw new Error('truncated varint');
      b = buf[pos++]; r += (b & 0x7f) * 2 ** s; s += 7;
    } while (b & 0x80);
    return r;
  };
  while (pos < buf.length) {
    const start = pos;
    const key = varint();
    if ((key & 7) !== 2) throw new Error('unexpected wire type at top level');
    const len = varint();
    const end = pos + len;
    if (end > buf.length) throw new Error('truncated field');
    const field = Math.floor(key / 8);
    if (field === 1 || (field === 2 && contains(buf, pos, end, needle))) { keep.push([start, end]); total += end - start; }
    pos = end;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const [s, e] of keep) { out.set(buf.subarray(s, e), o); o += e - s; }
  return out;
}
```

`worker/src/pb.ts`: add to `Reader`
```ts
float32(): number { const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true); this.pos += 4; return v; }
```
and make `span()` throw `new Error('truncated')` when `this.pos > this.end` after advancing (bounds check; this also makes the garbage-body test fail decoding → 503). Add:
```ts
export interface RawVehicle {
  trip: { tripId: string | null; routeId: string | null; startDate: string | null } | null;
  lat: number | null; lon: number | null; bearing: number | null; speed: number | null;
  stopSeq: number | null; ts: number | null; id: string | null; label: string | null;
}
function readPosition(r: Reader, v: RawVehicle) {
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 5) v.lat = r.float32();
    else if (f === 2 && wt === 5) v.lon = r.float32();
    else if (f === 3 && wt === 5) v.bearing = r.float32();
    else if (f === 5 && wt === 5) v.speed = r.float32();
    else r.skip(wt);
  }
}
function readVehicleDescriptor(r: Reader, v: RawVehicle) {
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) v.id = r.string();
    else if (f === 2 && wt === 2) v.label = r.string();
    else r.skip(wt);
  }
}
function readVehicle(r: Reader): RawVehicle {
  const v: RawVehicle = { trip: null, lat: null, lon: null, bearing: null, speed: null, stopSeq: null, ts: null, id: null, label: null };
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) v.trip = readTrip(r.sub());
    else if (f === 2 && wt === 2) readPosition(r.sub(), v);
    else if (f === 3 && wt === 0) v.stopSeq = r.uint();
    else if (f === 5 && wt === 0) v.ts = r.uint();
    else if (f === 8 && wt === 2) readVehicleDescriptor(r.sub(), v);
    else r.skip(wt);
  }
  return v;
}
export function decodeVehiclePositions(buf: Uint8Array): { timestamp: number; vehicles: RawVehicle[] } {
  const r = new Reader(buf);
  let timestamp = 0;
  const vehicles: RawVehicle[] = [];
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) { const h = r.sub(); for (const [hf, hwt] of h.fields()) { if (hf === 3 && hwt === 0) timestamp = h.uint(); else h.skip(hwt); } }
    else if (f === 2 && wt === 2) { const e = r.sub(); for (const [ef, ewt] of e.fields()) { if (ef === 4 && ewt === 2) vehicles.push(readVehicle(e.sub())); else e.skip(ewt); } }
    else r.skip(wt);
  }
  return { timestamp, vehicles };
}
```
(Field numbers: FeedEntity.vehicle=4; VehiclePosition trip=1, position=2, current_stop_sequence=3, timestamp=5, vehicle=8; Position latitude=1, longitude=2, bearing=3, speed=5 (all float); VehicleDescriptor id=1, label=2.)

`worker/src/filter.ts` add:
```ts
export function filterPositions(feed: { timestamp: number; vehicles: RawVehicle[] }): PositionsResponse {
  const vehicles: Vehicle[] = [];
  for (const v of feed.vehicles) {
    const t = v.trip;
    if (!t?.tripId || !t.routeId || !FREE.has(t.routeId) || v.lat == null || v.lon == null) continue;
    vehicles.push({
      id: v.id ?? t.tripId, label: v.label ?? '', tripId: t.tripId, routeId: t.routeId as FreeRouteId, startDate: t.startDate ?? '',
      lat: +v.lat.toFixed(6), lon: +v.lon.toFixed(6), bearing: v.bearing ?? null, speed: v.speed ?? null,
      stopSeq: v.stopSeq ?? null, ts: v.ts ?? feed.timestamp,
    });
  }
  return { generatedAt: feed.timestamp, vehicles };
}
```

`worker/src/index.ts` — routes table with per-route memo:
```ts
const ROUTES: Record<string, { url: string; build: (buf: Uint8Array) => unknown }> = {
  '/delays': { url: 'https://api.golemio.cz/v2/vehiclepositions/gtfsrt/trip_updates.pb', build: (b) => filterDelays(decodeTripUpdates(prefilter(b))) },
  '/positions': { url: 'https://api.golemio.cz/v2/vehiclepositions/gtfsrt/vehicle_positions.pb', build: (b) => filterPositions(decodeVehiclePositions(prefilter(b))) },
};
const TTL_MS = 15_000, STALE_MS = 120_000;
export function createHandler(deps: { fetchUpstream: (url: string, signal: AbortSignal) => Promise<Response>; now: () => number; timeoutMs?: number }) {
  const memo = new Map<string, { at: number; body: string }>();
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(req.url).pathname;
    const route = ROUTES[path];
    if (!route) return json({ error: 'not found' }, 404);
    let m = memo.get(path);
    let stale = false;
    if (!m || deps.now() - m.at >= TTL_MS) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 8_000);
      try {
        const up = await deps.fetchUpstream(route.url, ctrl.signal);
        if (!up.ok) throw new Error('upstream ' + up.status);
        const body = JSON.stringify(route.build(new Uint8Array(await up.arrayBuffer())));
        m = { at: deps.now(), body };
        memo.set(path, m);
      } catch (e) {
        if (!m || deps.now() - m.at > STALE_MS) return json({ error: String(e instanceof Error ? e.message : e) }, 503);
        stale = true;
      } finally {
        clearTimeout(timer);
      }
    }
    return new Response(m.body, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15', ...CORS, ...(stale ? { 'X-Stale': '1', 'Access-Control-Expose-Headers': 'X-Stale' } : {}) } });
  };
}
const handler = createHandler({ fetchUpstream: (url, signal) => fetch(url, { signal }), now: () => Date.now() });
export default { fetch: (req: Request) => handler(req) };
```
Note: a stale response must not refresh `m.at` (so the 120 s window is measured from the last good fetch).

- [ ] **Step 6: GREEN** — `npm test -w worker && npm run typecheck -w worker` all pass.

- [ ] **Step 7: Deploy + smoke**: `cd worker && npx --yes wrangler@4 deploy && cd ..`; `curl -s https://ricany-bus-live.pokeypoke.workers.dev/positions | head -c 300` → `{"generatedAt":…,"vehicles":[…` ; `/delays` still works. Check CPU: `npx --yes wrangler@4 tail ricany-bus-live --format json` for ~1 min while curling both endpoints a few times; record any `exceededCpu` outcomes in the report (expected none).

- [ ] **Step 8: Commit + push** ("feat(worker): pre-filtered decoding, /positions, stale-on-error, upstream timeout").

---

### Task 2: CI — Node 22, ubuntu-24.04, Worker deploy workflow

**Files:** Modify `.github/workflows/{ci,deploy,refresh-data}.yml`; create `.github/workflows/worker.yml`; modify `README.md`.

- [ ] **Step 1:** In all three workflows: `runs-on: ubuntu-24.04`, `node-version: 22`.
- [ ] **Step 2:** `.github/workflows/worker.yml`:
```yaml
name: Deploy Worker
on:
  push:
    branches: [main]
    paths: ['worker/**', 'shared/**', '.github/workflows/worker.yml']
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test -w worker && npm run typecheck -w worker
      - name: Deploy (skipped when CLOUDFLARE_API_TOKEN is not configured)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: [redacted-account-id]
        run: |
          if [ -z "$CLOUDFLARE_API_TOKEN" ]; then echo "::notice::CLOUDFLARE_API_TOKEN not set — skipping deploy (deploy manually: cd worker && npx --yes wrangler@4 deploy)"; exit 0; fi
          cd worker && npx --yes wrangler@4 deploy
```
- [ ] **Step 3:** README "Commands": Worker deploys automatically from GitHub when the `CLOUDFLARE_API_TOKEN` secret exists (Workers Scripts:Edit on this account); otherwise manually.
- [ ] **Step 4:** Commit + push; `gh run watch --exit-status` for CI and Deploy Worker (expect success; worker deploy step prints the skip notice until the secret exists).

(Token creation is done by the controller, not the implementer.)

---

### Task 3: Pipeline — stop groups, holiday-safe gate; app loads groups

**Files:** Modify `shared/src/types.ts`, `pipeline/src/build.ts`, `pipeline/src/validate.ts`, `pipeline/src/cli.ts`, `pipeline/test/{build,validate}.test.ts`, `app/src/lib/data.ts`, `app/test/fixtures/net.ts` (add `group`), regenerate `app/public/data/*`.

**Interfaces:**
- shared: `StopRec.group: number`; `interface StopGroup { id: string; name: string; lat: number; lon: number; platforms: number[]; lines: FreeRouteId[] }`; `interface GroupsFile { groups: StopGroup[] }`.
- `BuiltData` gains `groups: GroupsFile`; CLI writes `groups.json`.
- `AppData` gains `groups: StopGroup[]`; `loadData` fetches `groups.json`.

- [ ] **Step 1: Failing tests** in `pipeline/test/build.test.ts`:
```ts
describe('groups', () => {
  it('one group per display name with mean position, sorted platforms, ordered lines', () => {
    const g = data.groups.groups;
    expect(g.map((x) => x.name).sort()).toEqual(['Alfa', 'Beta', 'Delta', 'Epsilon', 'Gamma']);
    const alfa = g.find((x) => x.name === 'Alfa')!;
    expect(alfa.id).toBe('UA');
    expect(alfa.platforms).toEqual([idx('UA')]);
    expect(alfa.lines).toEqual(['L1731']);
    for (const s of data.stops.stops) expect(g[s.group].platforms).toContain(data.stops.stops.indexOf(s));
  });
});
```
and a second fixture-free unit test that calls an exported `groupStops(stops: Omit<StopRec,'group'>[])` with two platforms named "X" (lines L1733 and L1731) → one group, `lines` `['L1731','L1733']` (LINE_ORDER), lat/lon = mean, id = smaller platform id.

In `pipeline/test/validate.test.ts` replace the 4-of-7 tests' expectations with the new rule: passes when ≥ 3 of next 10 days have services with trips; fails ("only N of the next 10 days have service (need ≥ 3)") on an emptied `servicesByDate`; still rejects non-finite times.

- [ ] **Step 2: RED**, then **implement**: in `build.ts`
```ts
export function groupStops(stops: Omit<StopRec, 'group'>[]): { groups: StopGroup[]; groupOf: number[] } {
  const byName = new Map<string, number[]>();
  stops.forEach((s, i) => { const a = byName.get(s.name) ?? []; a.push(i); byName.set(s.name, a); });
  const groups: StopGroup[] = [];
  const groupOf: number[] = new Array(stops.length);
  for (const [name, idxs] of byName) {
    idxs.sort((a, b) => (stops[a].id < stops[b].id ? -1 : 1));
    const lines = [...new Set(idxs.flatMap((i) => stops[i].lines))].sort((a, b) => LINE_ORDER.indexOf(a) - LINE_ORDER.indexOf(b));
    const lat = idxs.reduce((s, i) => s + stops[i].lat, 0) / idxs.length, lon = idxs.reduce((s, i) => s + stops[i].lon, 0) / idxs.length;
    const gi = groups.length;
    groups.push({ id: stops[idxs[0]].id, name, lat: +lat.toFixed(6), lon: +lon.toFixed(6), platforms: idxs, lines });
    for (const i of idxs) groupOf[i] = gi;
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  // re-index groupOf after sorting
  const order = new Map(groups.map((g, i) => [g.id, i]));
  for (let i = 0; i < stops.length; i++) groupOf[i] = order.get(stops[groups.find((g) => g.platforms.includes(i))!.platforms[0]].id)!;
  return { groups, groupOf };
}
```
(Implementer may simplify the re-index; behaviour: `groups` sorted by Czech name, `stops[i].group` points at its group.) `buildData` sets `stops[i].group` and returns `groups: { groups }`. `validate.ts`: count days d in `[today, today+9]` whose `servicesByDate[d]` contains a service id used by ≥ 1 trip; require ≥ 3. CLI writes `groups.json`.

- [ ] **Step 3:** `app/src/lib/data.ts` loads `groups`; `app/test/fixtures/net.ts` adds `group: i` to each synthetic stop; any app test constructing `AppData` adds `groups: []` or a matching list.
- [ ] **Step 4:** `npm test && npm run typecheck`; `npm run data` (real feed) → `groups.json` written, ~56 groups; `node -e "const g=require('./app/public/data/groups.json').groups;console.log(g.length,g.find(x=>x.name==='Masarykovo nám.'))"` shows 2 platforms.
- [ ] **Step 5:** Commit + push.

---

### Task 4: Router helpers — direct rides, downstream stops, vehicle freshness

**Files:** Create `app/src/router/directRides.ts`, `app/test/directRides.test.ts`; modify `app/src/lib/live.ts` (pure helpers only here), `app/test/live.test.ts`.

**Interfaces:**
```ts
export interface DirectRide { tripId: string; serviceDate: string; date: string; p: number; boardPos: number; alightPos: number; dep: number; arr: number; boardSeq: number; alightSeq: number; headsign: string }
export function directRides(netFor: (d: string) => Network, date: string, fromSec: number, routeId: FreeRouteId, directionId: number, fromStops: number[], toStops: number[], limit?: number /*6*/, maxDays?: number /*2*/): DirectRide[]
export interface Downstream { group: number; name: string; minutes: number }
export function downstreamStops(tt: TimetableFile, stops: StopRec[], routeId: FreeRouteId, directionId: number, ordered: number[], fromStops: number[]): Downstream[]
// live.ts
export function freshVehicles(r: PositionsResponse | null, nowMs: number, maxAgeMs?: number /*180000*/): Vehicle[]
export function resolveVehicleTrip(v: Vehicle, netFor: (d: string) => Network): { net: Network; p: number; trip: number } | null
```

- [ ] **Step 1: Tests** (`app/test/directRides.test.ts`, using `app/test/fixtures/net.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { directRides, downstreamStops } from '../src/router/directRides';
import { stops, timetable, H } from './fixtures/net';
const netFor = (d: string) => buildNetwork(stops, timetable, d);

describe('directRides', () => {
  it('lists departures of the line from A that reach B, in time order', () => {
    const r = directRides(netFor, '20261019', H(7, 55), 'L1731', 0, [0], [2]);
    expect(r.map((x) => [x.tripId, x.dep, x.arr])).toEqual([['a1', H(8, 0), H(8, 10)], ['a2', H(8, 30), H(8, 40)]]);
  });
  it('rolls to the next service day', () => {
    const r = directRides(netFor, '20261019', H(9, 0), 'L1731', 0, [0], [2], 1);
    expect(r[0]).toMatchObject({ tripId: 'a1', date: '20261020', dep: H(8, 0) });
  });
  it('ignores stops in the wrong order', () => {
    expect(directRides(netFor, '20261019', 0, 'L1731', 0, [2], [0])).toEqual([]);
  });
});

describe('downstreamStops', () => {
  it('lists later stops with typical minutes from the first trip', () => {
    const d = downstreamStops(timetable, stops, 'L1731', 0, [0, 1, 2], [0]);
    expect(d.map((x) => [x.group, x.minutes])).toEqual([[1, 5], [2, 10]]);
  });
  it('downstreamStops on a branch pattern', () => {
    // a stop that only appears in one pattern still gets a time from that pattern; stops not reachable are skipped
    const d = downstreamStops(timetable, stops, 'L1731', 0, [0, 1, 2, 5], [1]);
    expect(d.map((x) => x.group)).toEqual([2]);
  });
});
```
In `app/test/live.test.ts` add:
```ts
it('freshVehicles keeps vehicles and resolveVehicleTrip uses startDate', () => {
  const v = { id: 'x', label: '1', tripId: 'n1', routeId: 'L1736', startDate: '20261018', lat: 50, lon: 14.6, bearing: 90, speed: 3, stopSeq: 1, ts: 1000 } as const;
  expect(freshVehicles({ generatedAt: 1000, vehicles: [v] }, 1000_000 + 60_000)).toHaveLength(1);
  expect(freshVehicles({ generatedAt: 1000, vehicles: [v] }, 1000_000 + 200_000)).toHaveLength(0);
  const hit = resolveVehicleTrip(v, (d) => buildNetwork(stops, timetable, d));
  expect(hit && hit.net.patterns[hit.p].trips[hit.trip]).toMatchObject({ id: 'n1', serviceDate: '20261018' });
});
```
(`resolveVehicleTrip` looks in the network for `v.startDate` first, then `addDays(startDate, 1)` where previous-day trips appear shifted; returns the trip whose `id === tripId && serviceDate === startDate`.)

- [ ] **Step 2: RED → implement → GREEN.** `downstreamStops`: index `b0` = first position in `ordered` whose stop ∈ `fromStops`; for each later `s` in `ordered`, find a pattern of `routeId/directionId` with positions `b < j`, `stops[b] ∈ fromStops`, `stops[j] === s`; minutes = round((trips[0].arr[j] − trips[0].dep[b]) / 60); skip if none; dedupe by `stops[s].group` keeping the first. `freshVehicles`: `ts * 1000 >= nowMs - maxAgeMs`.
- [ ] **Step 3:** `npm test -w app && npm run typecheck -w app`; commit + push.

---

### Task 5: Map — ring stop markers, numbered line stops, hover sync state, style fallback

**Files:** Create `app/src/map/rings.ts`, `app/test/rings.test.ts`. Modify `app/src/map/geojson.ts`, `app/test/geojson.test.ts`, `app/src/map/layers.ts`, `app/src/map/MapView.svelte`, `app/src/lib/ui.ts`.

**Interfaces:**
```ts
// rings.ts
export const ringKey = (lines: FreeRouteId[]) => 'ring-' + lines.join('-');
export function ringSegments(lines: FreeRouteId[]): { color: string; start: number; end: number }[] // radians, start at -π/2, equal arcs, 0.08 rad gap when >1
export function drawRing(lines: FreeRouteId[], px = 48): ImageData  // browser only (OffscreenCanvas or <canvas>)
// geojson.ts
export const groupsGeoJson = (groups: StopGroup[]) => FC  // Point; props { gi, id, name, ring }
export function lineStopsGeoJson(groups: StopGroup[], stops: StopRec[], line: LineRec, directionId: number): FC // dedup by group in direction order; props { gi, n, color, text, stopIdx, number, directionId }
// ui.ts
export const hoverGroup = writable<number | null>(null);
export const lineSelection = writable<{ number: string; directionId: number } | null>(null);
```

- [ ] **Step 1: Tests**: `ringSegments(['L1731'])` → one segment full circle (start −π/2, end 3π/2); two lines → two arcs of equal length with gaps, colours from LINE_STYLE in order; `ringKey(['L1731','L1733'])` = `'ring-L1731-L1733'`. `groupsGeoJson` props; `lineStopsGeoJson` numbering 1..n by group order, colour = line colour, dedupes a group appearing twice.
- [ ] **Step 2: Implement** layers (replace the `stops`/`stops-label` layers):
  - Source `groups` (`promoteId: 'gi'`) from `groupsGeoJson(data.groups)`.
  - Before adding layers, for each distinct `ring` key: `if (!map.hasImage(key)) map.addImage(key, drawRing(lines), { pixelRatio: 2 })`.
  - `groups-hit`: circle radius 22, opacity 0 (hit area ≥ 44 px).
  - `groups`: symbol `icon-image: ['get','ring']`, `icon-size: ['interpolate',['linear'],['zoom'],12,0.3,16,0.55]` × `['case',['boolean',['feature-state','hover'],false],1.5,1]`, `icon-allow-overlap: true`.
  - `groups-label`: `minzoom: 14`, text = name, size 12, halo 2 px white, offset below icon, `text-optional: true`.
  - Source `line-stops` (`promoteId: 'gi'`), layers `line-stops` (circle radius 11, colour = `['get','color']`, white stroke 2) + `line-stops-num` (text `['to-string',['get','n']]`, bold 11, colour `['get','text']`, allow overlap). Hover state scales radius to 15.
  - When `lineSelection` set: `groups`/`groups-label` opacity 0.4; `line-stops*` visible. Else hidden.
  - Drop the old `stops` source/layers; `stopsGeoJson` may be deleted if unused (update its test).
- [ ] **Step 3: MapView**:
  - Click priority: `bikes` > `line-stops` > `groups-hit` > `lines`. `line-stops` click → `navigate({ name: 'line', number, dir: directionId, stopId: stops[stopIdx].id }, true)`. `groups-hit` click → `navigate({ name: 'stop', stopId: groups[gi].id })`.
  - `mousemove` over `groups-hit`/`line-stops` sets `hoverGroup` (desktop); `mouseleave` clears. An `$effect` mirrors `$hoverGroup` into `map.setFeatureState({ source: 'groups', id }, { hover: true })` and the same on `line-stops` (clear previous).
  - `$effect` on `$lineSelection` sets `line-stops` data via `lineStopsGeoJson` and toggles visibility/opacities.
  - **Style fallback**: start a timer at map creation; if `load` hasn't fired after 8 s or `error` fires before `load`, call `map.setStyle(FALLBACK_STYLE)` where `FALLBACK_STYLE = { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef2f5' } }] }`, re-add our layers on `style.load`, and show a small overlay note `$t('mapFallback')` ("Mapa se nenačetla — zobrazuji jen linky a zastávky" / "Map didn't load — showing lines and stops only").
- [ ] **Step 4:** i18n keys `mapFallback`. `npm test -w app && npm run typecheck -w app && npm run build -w app`. Playwright scratch screenshot (390×844, dev server, zoom 15 near Masarykovo nám.) — ring markers with names; Read it.
- [ ] **Step 5:** Commit + push.

---

### Task 6: Live buses — poller, layer, bus sheet, trip-detail live line

**Files:** Modify `app/src/lib/live.ts`, `app/test/live.test.ts`, `app/src/map/{geojson,layers}.ts`, `app/src/map/MapView.svelte`, `app/src/sheets/TripDetail.svelte`, `app/src/lib/hashRoute.ts`, `app/test/hashRoute.test.ts`, `app/src/App.svelte`, `app/src/lib/i18n.ts`. Create `app/src/sheets/BusSheet.svelte`, `app/src/map/busIcons.ts`.

**Interfaces:**
- `live.ts`: `positions: Writable<PositionsResponse | null>`, `positionsOk`, `usePositions = createPoller(fetchPositions, 15_000, positions, positionsOk)`; `createPoller` gains visibility pausing: while `document.visibilityState === 'hidden'` the interval is cleared; on `visible` it ticks immediately and restarts the interval (only when refs > 0). Inject `doc: { visibilityState: string; addEventListener; removeEventListener } | undefined = globalThis.document` as an optional last parameter for tests.
- `geojson.ts`: `busesGeoJson(vehicles: Vehicle[]) → FC` props `{ tripId, routeId, number, color, text, bearing (number, -1 if null) }`.
- `busIcons.ts`: `drawBusIcon(routeId): ImageData` (rounded square 36 px in line colour, number centred, white 2 px border) and `drawArrow(): ImageData` (small white-bordered triangle pointing up).
- Route `{ name: 'bus'; tripId: string }` ↔ `#/bus/<tripId>`.

- [ ] **Step 1: Tests**: `poller pauses while hidden and ticks on return` (fake timers + fake `doc` EventTarget-like object: acquire → 1 call; set hidden + dispatch → advance 60 s → still 1; set visible + dispatch → 2 immediately; advance 15 s → 3). hashRoute round-trip for `bus`. `busesGeoJson` props.
- [ ] **Step 2: Implement**:
  - MapView: `usePositions()` acquired while mounted; images `bus-<routeId>` and `bus-arrow` added on load; layers `buses-arrow` (symbol `icon-image: 'bus-arrow'`, `icon-rotate: ['get','bearing']`, `icon-rotation-alignment: 'map'`, `icon-offset: [0,-22]`, filter `['>=',['get','bearing'],0]`) and `buses` (icon `['concat','bus-',['get','routeId']]`, allow overlap) above everything; data = `busesGeoJson(freshVehicles($positions, Date.now()))`, recomputed on every positions update and every `$now` tick. Click priority: `buses` first → `navigate({ name: 'bus', tripId })`.
  - BusSheet (`#/bus/:tripId`): find vehicle in `$positions`; `resolveVehicleTrip(v, netFor-bound)`; header LineBadge + `→ headsign`; delay via `tripDelay($delays, tripId, startDate, seq)`; list of remaining stops (from `stopSeq` onwards; current stop bold) with ETA = scheduled + delay (formatHM); each stop row tappable → stop board. If the trip can't be resolved: line + "Poloha autobusu" + timestamp only. If the vehicle disappears (stale) → message `busGone` ("Autobus už neposílá polohu"). focus map on the vehicle (keyed on tripId only).
  - TripDetail: for each bus leg, find a fresh vehicle with `tripId === leg.tripId && startDate === leg.serviceDate`; if found, show `🚌 {$t('busNow', { stop })}` where stop = name of pattern stop at `stopSeq` position, or `$t('busStopsAway', { n })` when n = boardSeq − stopSeq > 0.
  - i18n: `busGone`, `busNow` ("autobus je teď u zastávky {stop}" / "bus is now at {stop}"), `busStopsAway` ("autobus je {n} zast. od vás" / "bus is {n} stops away"), `livePosition` ("Poloha autobusu" / "Bus position").
- [ ] **Step 3:** `npm test -w app && npm run typecheck -w app && npm run build -w app`; scratch Playwright with real network during service hours: buses visible on the map; tap one → bus sheet. Screenshot + Read.
- [ ] **Step 4:** Commit + push.

---

### Task 7: Line view ↔ map, "Kam pojedete?" and direct-ride sheets

**Files:** Modify `app/src/sheets/LineView.svelte`, `app/src/sheets/StopBoard.svelte`, `app/src/lib/hashRoute.ts` (+test), `app/src/App.svelte`, `app/src/lib/i18n.ts`. Create `app/src/sheets/FromSheet.svelte`, `app/src/sheets/RideSheet.svelte`.

**Interfaces:**
- Routes: `{ name: 'from'; groupId: string; line?: string; dir?: number }` ↔ `#/from/<groupId>?line=3&dir=0`; `{ name: 'ride'; line: string; dir: number; from: string; to: string }` ↔ `#/ride?line=3&dir=0&from=<gid>&to=<gid>`.

- [ ] **Step 1: hashRoute tests** (round-trip both, garbage → home) → implement.
- [ ] **Step 2: LineView**:
  - `$effect` (keyed on line + direction) sets `lineSelection.set({ number, directionId })`; cleanup sets null.
  - Stop rows: `onmouseenter` → `hoverGroup.set(stops[i].group)`, `onmouseleave` → null; row gets class `hover` when `$hoverGroup === stops[i].group` (map → list sync) and scrolls into view (`scrollIntoView({ block: 'nearest' })`) when hovered from the map.
  - Selected row: `aria-current="true"`, and tapping a row also pans the map (`focusPoints.set([[lon, lat]])`).
  - Under the selected stop's heading: button `$t('whereTo')` → `navigate({ name: 'from', groupId: groups[stops[selIdx].group].id, line: number, dir })`.
  - `<h2>🚏</h2>` → `<h2>{$t('stops')}</h2>` (new key "Zastávky"/"Stops").
- [ ] **Step 3: StopBoard**: "Jet odsud" → `navigate({ name: 'from', groupId: groupOfThisStop.id })`.
- [ ] **Step 4: FromSheet** (`#/from/:groupId`): header `🚏 {group.name}` + back; `<PlaceInput label={$t('otherPlace')} target="to" …>` → on choose `navigate({ name: 'plan', mode: 'now', from: groupPlace, to: p })`; then:
  - with `line`/`dir`: one section for that line's direction (`downstreamStops(tt, stops, routeId, dir, direction.stops, group.platforms)`).
  - without: one section per line in `group.lines` (LineBadge header + small direction toggle, default the direction where the group isn't the last stop), each list collapsible (first expanded).
  - Each row: name + `+{minutes} min` → `navigate({ name: 'ride', line, dir, from: groupId, to: groups[row.group].id })`.
  - Footer link `$t('planWithChange')` → planner with only `from`.
  - Map: focus on the group; `lineSelection` set when `line` given.
- [ ] **Step 5: RideSheet** (`#/ride`): `directRides(netFor(data, ·), $now.date, $now.sec − 60, routeId, dir, fromGroup.platforms, toGroup.platforms, 6)`; rows: `dep` (+ DelayBadge via `tripDelay`) → `arr` · duration min · "zítra"/date label when `date !== today`; empty → `$t('noDirectRide')` + planner link; footer `$t('planFull')` → planner from→to (group places). Map: `lineSelection` set; focus both groups. Rows recompute on `$now` and `$delays`.
- [ ] **Step 6:** i18n keys: `stops`, `otherPlace` ("Jiná adresa nebo místo…"/"Another address or place…"), `planWithChange` ("Hledat spojení s přestupem"/"Search with transfers"), `planFull` ("Celý plánovač"/"Full planner"), `noDirectRide` ("Tato linka mezi zastávkami teď nejede"/"This line doesn't run between these stops now"), `nextStops` ("Další zastávky"/"Next stops").
- [ ] **Step 7:** typecheck/test/build; scratch Playwright (fixed weekday 07:30): `#/line/3` → tap 4th stop → "Kam jedete?" → tap a downstream stop → ride list with ≥ 1 row. Screenshots + Read. Commit + push.

---

### Task 8: Polish — About, share, accessibility, small deferred fixes

**Files:** Create `app/src/sheets/About.svelte`. Modify `App.svelte` (ⓘ button, about route), `hashRoute.ts` (+test `about`), `TripDetail.svelte` (share), `PlaceInput.svelte` (combobox), `Home.svelte` (✕ 44 px), `BottomSheet.svelte` (`aria-valuetext`), `MapView.svelte` (locate pending), `BikeStation.svelte` + `StopBoard.svelte` (stale bike warning), `Planner.svelte` (`shift()` across midnight; back), `i18n.ts`. Create `app/src/lib/share.ts` + `app/test/share.test.ts`.

- [ ] **About** (`#/about`, ⓘ icon button in the top bar, aria-label `$t('about')`): sections per spec §6 with exact Czech wording:
  - "Říčany zdarma plánuje cesty jen bezplatnými linkami MHD Říčany: 1, 2, 3, 7, 9, 91 a 92 — a pěšky nebo na Nextbike."
  - "Linky MHD Říčany jsou podle města bezplatné — aktuální podmínky ověřte na ricany.cz." (link `https://www.ricany.cz`)
  - Data: "Jízdní řády a polohy vozidel: PID / ROPID (otevřená data). Mapa: © přispěvatelé OpenStreetMap, OpenFreeMap. Vyhledávání: Photon. Kola: Nextbike."
  - "Neoficiální aplikace, není spojena s městem Říčany ani s PID."
  - "Jízdní řády platí {from}–{to}, aktualizováno {generated}." (format dates d. m. yyyy)
  - Link "Zdrojový kód na GitHubu" → `https://github.com/PokeyPoke/ricany-bus`.
  - English equivalents for every string.
- [ ] **Share** — `share.ts`: `export async function shareLink(url: string, title: string, nav = navigator): Promise<'shared' | 'copied' | 'manual'>` (try `nav.share`; on missing/throw non-AbortError try `nav.clipboard.writeText`; else `'manual'`; AbortError from share → `'shared'`-equivalent no-op returning `'shared'`). Tests cover the three outcomes with fake navigators. TripDetail: button `$t('share')` → `shareLink(location.href, title)`; toast `$t('linkCopied')` for 2.5 s on `'copied'`; on `'manual'` show the URL in a selectable `<input readonly>`.
- [ ] **Combobox** in PlaceInput: input `role="combobox"`, `aria-expanded={open}`, `aria-controls={listId}`, `aria-activedescendant`; list `role="listbox" id={listId}`; each option row `role="option"` with id and `aria-selected`; ArrowDown/ArrowUp move the active option, Enter chooses it, Escape closes. Keep the button elements inside options so e2e `getByRole('button', …)` keeps working, OR update Stage A e2e selectors to `getByRole('option', …)` consistently (record in report).
- [ ] **Targets/labels**: saved-place ✕ ≥ 44 px; BottomSheet `aria-valuetext` = "malý/střední/velký" (`$t('sheetSmall'|'sheetMedium'|'sheetLarge')`); locate button shows `aria-busy` + spinner glyph while locating.
- [ ] **Stale bikes**: StopBoard nearest-bike row and BikeStation show `$t('bikesStale', { n })` ("údaje o kolech jsou {n} min staré") when `Date.now() − $bikesAt > 5 min`.
- [ ] **shift() across midnight**: shifting past 23:59 moves `date` to the next day (and before 00:00 to the previous day) instead of clamping.
- [ ] **Trip detail back**: `onBack` uses `history.back()` when the previous hash was the same plan without `sel` (track in a module variable in nav.ts: `lastHash`), else navigate.
- [ ] typecheck/test/build/e2e (Stage A e2e must stay green); commit + push.

---

### Task 9: Offline precache, branding, Open Graph

**Files:** Modify `app/vite.config.ts`, `app/public/icons/icon.svg` (+ regenerate PNGs), `app/index.html`. Create `app/scripts/og.mjs`, `app/public/og.png`, `app/test/meta.test.ts`.

- [ ] **Precache data**: `globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}', 'data/*.json']`; keep the runtime SWR rule (harmless fallback). Build and confirm `grep -c 'data/timetable.json' dist/sw.js` ≥ 1.
- [ ] **Icon**: new `icon.svg` — rounded square background `#0b5cad`; white bus front (windscreen, two headlights); a ticket shape overlapping the lower right with "0 Kč" in bold; a thin stripe of the 7 line colours along the bottom edge (LINE_ORDER). Regenerate with `cd app && npx --yes @vite-pwa/assets-generator@1 --preset minimal-2023 public/icons/icon.svg`.
- [ ] **OG image**: `app/scripts/og.mjs` (Node, uses `@playwright/test`'s `chromium`) renders an inline 1200×630 HTML (blue background, icon, title "Říčany zdarma", subtitle "Spojení jen bezplatnými autobusy MHD Říčany", the 7 line badges) to `app/public/og.png`. Run once and commit the PNG. Add npm script `"og": "node scripts/og.mjs"`.
- [ ] **Meta tags** in `index.html`: `og:type=website`, `og:title`, `og:description`, `og:url=https://pokeypoke.github.io/ricany-bus/`, `og:image=https://pokeypoke.github.io/ricany-bus/og.png`, `og:image:width=1200`, `og:image:height=630`, `twitter:card=summary_large_image`, `og:locale=cs_CZ`. `app/test/meta.test.ts` reads `index.html` and asserts each tag and that `public/og.png` exists and is 1200×630 (read PNG IHDR bytes 16–23).
- [ ] typecheck/test/build; commit + push; after deploy `curl -sI https://pokeypoke.github.io/ricany-bus/og.png` → 200 image/png.

---

### Task 10: Stage B e2e, offline test, deploy, live verification

**Files:** Create `app/e2e/stage-b.spec.ts`, `app/e2e/fixtures/positions.ts` (or extend `fixtures.ts`), `docs/verification-b.md`. Modify `app/e2e/fixtures.ts` (mock `/positions`).

- [ ] **Mocks**: `/positions` returns one vehicle on line 3 at the first stop of line 3 direction 0, `tripId` = the first weekday trip of that pattern at/after 07:30 on DATE (compute from `timetable.json` in the fixture), `startDate = DATE`, `ts` = the fixed clock time in unix seconds, `bearing: 45`, `stopSeq: 1`.
- [ ] **Tests**:
  1. Bus on the map: click the bus icon position (project via `page.evaluate` on the map instance exposed as `window.__rbMap` in dev/test builds only — add `if (import.meta.env.MODE !== 'production' || location.search.includes('e2e')) window.__rbMap = map`; or simpler: navigate to `#/bus/<tripId>`) → bus sheet shows line 3 badge and ≥ 1 stop row.
  2. Line view: `#/line/3` → numbered markers exist (`page.evaluate(() => __rbMap.querySourceFeatures('line-stops').length) > 0`) and tapping the 4th stop row sets `aria-current` on it.
  3. "Kam pojedete?": from line view selected stop → button → panel lists ≥ 1 downstream stop with "+N min" → tap → ride sheet shows ≥ 1 departure row (class `ride`).
  4. Stop board "Jet odsud" → URL `#/from/…` and the search field labelled 'Jiná adresa nebo místo…' is visible.
  5. About page: ⓘ → texts "Neoficiální aplikace" and "ricany.cz" link.
  6. Share fallback: stub `navigator.share` undefined + `navigator.clipboard.writeText` resolving → toast 'Odkaz zkopírován'.
  7. Combobox keyboard: focus 'Kam', type stop prefix, ArrowDown, Enter → URL has `to=`.
  8. `planner works offline after first visit` — `test.use({ serviceWorkers: 'allow' })`: goto home; wait for `navigator.serviceWorker.ready` and `navigator.serviceWorker.controller`; reload once (so the page is controlled); `context.setOffline(true)`; goto the Stage A plan URL → `.card` visible.
- [ ] Run `npm run e2e -w app` → all Stage A + Stage B tests pass. Commit + push; watch CI + Deploy green.
- [ ] **Live verification** (Playwright against the deployed site, 390×844, real network, during service hours): buses visible; tap → bus sheet; ring markers; line 3 numbered stops; Kam pojedete → ride list; About; EN toggle. Screenshots in scratch + Read. `curl` `/positions` and `/delays`; note `X-Stale` absent.
- [ ] **docs/verification-b.md**: per DoD item (spec §10) evidence, CI/deploy URLs, screenshots list, anything not verified (e.g. Worker CPU under peak; GitHub worker deploy skipped if no token).
- [ ] Commit + push.

---

## Self-review notes (planning)

- Spec coverage: §2 → Tasks 3, 5; §3 → Tasks 5, 7; §4 → Tasks 4, 7; §5.1–5.2 → Task 1 (+ Task 2 deploy); §5.3 → Tasks 4, 6; §6 → Tasks 2, 3 (gate), 5 (fallback), 8, 9 (offline); §7 → Task 9; §8 errors → Tasks 1, 5, 6, 7, 8; §9 → tests in every task + Task 10; §10 → Task 10 doc.
- Cloudflare API token: controller attempts creation via Chrome between Task 2 and Task 10; workflow skips cleanly without it.
