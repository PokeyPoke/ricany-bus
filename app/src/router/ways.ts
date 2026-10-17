import { bikeSec, haversine, walkSec, type Snap, type StreetGraph, type StreetMode, type Tree } from '@rb/shared';

export interface Pt { lat: number; lon: number }
export interface Route {
  /** Infinity when the street route is longer than the search limit */
  m: number;
  sec: number;
  /** street path as [lon, lat]; absent for straight-line estimates */
  path?: () => [number, number][] | undefined;
}
export interface Ways {
  /** `limitM`: street meters beyond which the route may be reported as Infinity (smaller = faster) */
  walk(a: Pt, b: Pt, limitM?: number): Route;
  bike(a: Pt, b: Pt, limitM?: number): Route;
}

const straight = (a: Pt, b: Pt, mode: StreetMode): Route => {
  const m = haversine(a.lat, a.lon, b.lat, b.lon);
  return { m, sec: mode === 'walk' ? walkSec(m) : bikeSec(m) };
};

/** Straight-line distance × DETOUR — the model used when no street graph is loaded. */
export const straightWays: Ways = { walk: (a, b) => straight(a, b, 'walk'), bike: (a, b) => straight(a, b, 'bike') };

const MAX_M: Record<StreetMode, number> = { walk: 3500, bike: 10_000 };

/** Street-network distances; trees and snaps are cached for the lifetime of this object (one plan). */
export function streetWays(g: StreetGraph): Ways {
  const snaps = new Map<string, Snap | null>();
  const trees = new Map<string, Tree>();
  const key = (p: Pt, mode: StreetMode) => `${mode}:${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const snap = (p: Pt, mode: StreetMode) => {
    const k = key(p, mode);
    if (!snaps.has(k)) snaps.set(k, g.snap(p.lat, p.lon, mode));
    return snaps.get(k)!;
  };
  const has = (p: Pt, mode: StreetMode, limit: number) => (trees.get(key(p, mode))?.maxM ?? -1) >= limit;
  const tree = (p: Pt, s: Snap, mode: StreetMode, limit: number) => {
    const k = key(p, mode);
    let t = trees.get(k);
    if (!t || t.maxM < limit) trees.set(k, (t = g.search(s, mode, limit)));
    return t;
  };
  const route = (a: Pt, b: Pt, mode: StreetMode, limitM = MAX_M[mode]): Route => {
    const sa = snap(a, mode), sb = snap(b, mode);
    if (!sa || !sb) return straight(a, b, mode);
    const limit = Math.min(limitM, MAX_M[mode]);
    // walking is symmetric: reuse a tree already grown from b (e.g. egress to the destination)
    const rev = mode === 'walk' && !has(a, mode, limit) && has(b, mode, limit);
    const t = rev ? tree(b, sb, mode, limit) : tree(a, sa, mode, limit);
    const target = rev ? sa : sb;
    const m = g.meters(t, target);
    // both points are on the (single-component) network, so no route within the limit means "too far"
    if (m === null) return { m: Infinity, sec: Infinity };
    return {
      m, sec: mode === 'walk' ? walkSec(m, false) : bikeSec(m, false),
      path: () => { const p = g.path(t, target) ?? undefined; return rev ? p?.reverse() : p; },
    };
  };
  return { walk: (a, b, l) => route(a, b, 'walk', l), bike: (a, b, l) => route(a, b, 'bike', l) };
}
