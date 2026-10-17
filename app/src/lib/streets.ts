import { writable } from 'svelte/store';
import { DETOUR, StreetGraph, haversine, walkSec, type StreetsFile } from '@rb/shared';
import { DATA_BASE } from '../config';
import { straightWays, streetWays, type Pt } from '../router/ways';

/** The street graph on the page itself (the router worker loads its own copy); null until loaded or if unavailable. */
export const streetGraph = writable<StreetGraph | null>(null);
let started = false;

export function useStreets(): void {
  if (started) return;
  started = true;
  fetch(`${DATA_BASE}streets.json`)
    .then((r) => (r.ok ? (r.json() as Promise<StreetsFile>) : Promise.reject(new Error(`streets: HTTP ${r.status}`))))
    .then((f) => streetGraph.set(new StreetGraph(f)))
    .catch((e) => console.warn('street graph unavailable, using straight-line distances', e));
}

/**
 * The `n` items nearest to `from` on foot, ranked by walking time: along streets when the graph is loaded
 * (candidates pre-selected by straight-line distance), otherwise straight-line meters with the usual detour.
 * `m` is the walked (or straight-line) distance in meters, `sec` the walking time.
 */
export function nearestOnFoot<T extends Pt>(g: StreetGraph | null, from: Pt, items: T[], n: number, maxM = 2000): { item: T; m: number; sec: number }[] {
  const byAir = items.map((item) => ({ item, m: haversine(from.lat, from.lon, item.lat, item.lon) }))
    .filter((x) => x.m <= maxM).sort((a, b) => a.m - b.m);
  const ways = g ? streetWays(g) : straightWays;
  return byAir.slice(0, g ? n * 3 : n)
    .map((x) => {
      const r = ways.walk(from, x.item, maxM * DETOUR);
      // Infinity: beyond the street search; keep the straight-line estimate so far items still rank
      return Number.isFinite(r.sec) ? { item: x.item, m: r.m, sec: r.sec } : { item: x.item, m: x.m, sec: walkSec(x.m) };
    })
    .filter((x) => x.sec <= walkSec(maxM)).sort((a, b) => a.sec - b.sec).slice(0, n)
    .map((x) => ({ ...x, m: Math.round(x.m) }));
}
