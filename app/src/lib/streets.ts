import { writable } from 'svelte/store';
import { StreetGraph, haversine, type StreetsFile } from '@rb/shared';
import { DATA_BASE } from '../config';
import { streetWays, type Pt } from '../router/ways';

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
 * The `n` items nearest to `from` on foot, with walking meters: street meters when the graph is loaded
 * (candidates pre-selected by straight-line distance), otherwise straight-line meters.
 */
export function nearestOnFoot<T extends Pt>(g: StreetGraph | null, from: Pt, items: T[], n: number, maxM = 2000): { item: T; m: number }[] {
  const byAir = items.map((item) => ({ item, m: haversine(from.lat, from.lon, item.lat, item.lon) }))
    .filter((x) => x.m <= maxM).sort((a, b) => a.m - b.m);
  if (!g) return byAir.slice(0, n).map((x) => ({ item: x.item, m: Math.round(x.m) }));
  const ways = streetWays(g);
  return byAir.slice(0, n * 3)
    .map((x) => ({ item: x.item, m: ways.walk(from, x.item, maxM * 1.6).m })) // Infinity: farther than the limit on foot
    .filter((x) => x.m <= maxM * 1.6).sort((a, b) => a.m - b.m).slice(0, n)
    .map((x) => ({ item: x.item, m: Math.round(x.m) }));
}
