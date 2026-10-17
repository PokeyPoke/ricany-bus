import { BIKE_BACK, BIKE_FWD, MAX_TRANSFER_WALK_M, WALK, StreetGraph, haversine, walkSec, type StopRec, type StreetsFile } from '@rb/shared';
import type { OsmData } from './osm';

const WALK_HW = new Set([
  'footway', 'path', 'pedestrian', 'living_street', 'residential', 'service', 'unclassified', 'road', 'track', 'steps',
  'cycleway', 'bridleway', 'corridor', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link',
]);
const BIKE_HW = new Set([
  'living_street', 'residential', 'service', 'unclassified', 'road', 'track', 'cycleway', 'path',
  'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link',
]);
const YES = new Set(['yes', 'designated', 'permissive']);
const NO = new Set(['no', 'private']);

/** Walk/bike permissions of an OSM way as edge flags (0 = unusable). */
export function wayFlags(t: Record<string, string>): number {
  const hw = t.highway;
  if (!hw || t.area === 'yes') return 0;
  const closed = NO.has(t.access ?? '');
  const walk = YES.has(t.foot ?? '') || (WALK_HW.has(hw) && !closed && !NO.has(t.foot ?? ''));
  const bikeAllowed = YES.has(t.bicycle ?? '')
    ? hw !== 'steps'
    : BIKE_HW.has(hw) && !closed && !NO.has(t.bicycle ?? '') && t.bicycle !== 'dismount' && t.bicycle !== 'use_sidepath';
  let f = walk ? WALK : 0;
  if (bikeAllowed) {
    const ow = t['oneway:bicycle'] ?? (/^opposite/.test(t.cycleway ?? '') ? 'no' : (t.oneway ?? (t.junction === 'roundabout' ? 'yes' : 'no')));
    if (ow === '-1') f |= BIKE_BACK;
    else if (ow === 'yes' || ow === 'true' || ow === '1') f |= BIKE_FWD;
    else f |= BIKE_FWD | BIKE_BACK;
  }
  return f;
}

const q = (x: number) => Math.round(x * 1e5);

/** Perpendicular distance (m) of p from segment a–b, local flat approximation. */
function offLine(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = 111_320 * Math.cos((p[0] * Math.PI) / 180);
  const ax = (a[1] - p[1]) * k, ay = (a[0] - p[0]) * 110_574, bx = (b[1] - p[1]) * k, by = (b[0] - p[0]) * 110_574;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Douglas–Peucker keep-mask over a polyline. */
function simplify(pts: [number, number][], tol: number): boolean[] {
  const keep = pts.map((_, i) => i === 0 || i === pts.length - 1);
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) { const d = offLine(pts[k], pts[i], pts[j]); if (d > bd) { bd = d; best = k; } }
    if (best >= 0) { keep[best] = true; stack.push([i, best], [best, j]); }
  }
  return keep;
}

export function buildStreets(osm: OsmData, generatedAt: string, tolM = 1.5): StreetsFile {
  const ways = osm.ways
    .map((w) => ({ nodes: w.nodes.filter((n) => osm.nodes.has(n)), f: wayFlags(w.tags) }))
    .filter((w) => w.f && w.nodes.length >= 2);
  // graph nodes: way ends and nodes shared by several ways (or repeated within one)
  const uses = new Map<number, number>();
  for (const w of ways) for (const n of w.nodes) uses.set(n, (uses.get(n) ?? 0) + 1);
  const isJunction = (n: number, i: number, len: number) => i === 0 || i === len - 1 || (uses.get(n) ?? 0) > 1;

  type RawEdge = { a: number; b: number; f: number; mid: number[] };
  const raw: RawEdge[] = [];
  for (const w of ways) {
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      if (!isJunction(w.nodes[i], i, w.nodes.length)) continue;
      if (w.nodes[start] !== w.nodes[i] || i - start > 1) raw.push({ a: w.nodes[start], b: w.nodes[i], f: w.f, mid: w.nodes.slice(start + 1, i) });
      start = i;
    }
  }

  // keep the largest connected component
  const parent = new Map<number, number>();
  const find = (x: number): number => { let r = x; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const e of raw) { if (!parent.has(e.a)) parent.set(e.a, e.a); if (!parent.has(e.b)) parent.set(e.b, e.b); parent.set(find(e.a), find(e.b)); }
  const size = new Map<number, number>();
  for (const e of raw) { const r = find(e.a); size.set(r, (size.get(r) ?? 0) + 1); }
  const main = [...size.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const edges = raw.filter((e) => find(e.a) === main);

  const idx = new Map<number, number>();
  const nodes: number[] = [];
  const id = (n: number) => {
    let i = idx.get(n);
    if (i === undefined) { i = idx.size; idx.set(n, i); const [la, lo] = osm.nodes.get(n)!; nodes.push(q(la), q(lo)); }
    return i;
  };
  const flat: number[] = [];
  const geom: number[][] = [];
  for (const e of edges) {
    const line = [e.a, ...e.mid, e.b].map((n) => osm.nodes.get(n)!);
    const keep = simplify(line, tolM);
    flat.push(id(e.a), id(e.b), e.f);
    const g: number[] = [];
    let [pla, plo] = [q(line[0][0]), q(line[0][1])];
    for (let i = 1; i < line.length - 1; i++) {
      if (!keep[i]) continue;
      const la = q(line[i][0]), lo = q(line[i][1]);
      g.push(la - pla, lo - plo);
      pla = la; plo = lo;
    }
    geom.push(g);
  }
  return { v: 1, generatedAt, nodes, edges: flat, geom };
}

const STREET_TRANSFER_MAX_M = MAX_TRANSFER_WALK_M * 1.6;
/** Platforms closer than this are usually just across the road; the graph may not model that crossing. */
const CROSS_DIRECT_M = 60;

/** Replaces straight-line stop transfers with street walking times where the graph reaches both stops. */
export function streetTransfers(stops: StopRec[], g: StreetGraph): void {
  const snaps = stops.map((s) => g.snap(s.lat, s.lon, 'walk'));
  stops.forEach((s, i) => {
    const sn = snaps[i];
    if (!sn) return;
    const tree = g.search(sn, 'walk', STREET_TRANSFER_MAX_M);
    s.transfers = s.transfers.map(([j, sec]) => {
      const t = snaps[j];
      if (!t || haversine(s.lat, s.lon, stops[j].lat, stops[j].lon) < CROSS_DIRECT_M) return [j, sec] as [number, number];
      const m = g.meters(tree, t);
      return [j, m === null ? sec : walkSec(m, false)] as [number, number];
    });
  });
}
