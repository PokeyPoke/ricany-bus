import { haversine, type FreeRouteId, type LineRec, type Vehicle } from '@rb/shared';
import type { AppData } from '../lib/data';
import type { Itinerary } from '../router/types';
import { resolveVehicleTrip } from '../lib/live';
import type { Network } from '../router/network';
import STOPS from './schemaStops.json';

/**
 * The city's line diagram (schema-linek-MHD.pdf, as SVG in /schema/linky.svg) used as the map.
 * Coordinates are the diagram's own points (733.65 × 529.56); every stop group has its dot's centre,
 * read from the PDF's vector drawing and checked by eye (scripts in the PR).
 */
export const SCHEMA_W = 733.654;
export const SCHEMA_H = 529.559;
export type XY = [number, number];
const POS = STOPS as unknown as Record<string, XY>;

/** the diagram's own line colours (they differ from PID's), so badges match what is drawn */
export const SCHEMA_COLORS: Record<FreeRouteId, { color: string; text: string }> = {
  L1731: { color: '#F9A72B', text: '#1d1d1b' }, // 1 orange
  L1732: { color: '#EF2E32', text: '#ffffff' }, // 2 red
  L1733: { color: '#50ADE5', text: '#0b2a40' }, // 3 blue
  L1736: { color: '#7641A4', text: '#ffffff' }, // 7 purple
  L1737: { color: '#754516', text: '#ffffff' }, // 9 brown
  L1734: { color: '#00A650', text: '#ffffff' }, // 91 green
  L1735: { color: '#80CC28', text: '#1d1d1b' }, // 92 light green
};

export const groupXY = (data: AppData, gi: number): XY | null => POS[data.groups[gi]?.id] ?? null;
export const stopXY = (data: AppData, stopIdx: number): XY | null => groupXY(data, data.stops[stopIdx].group);

/** the stop group nearest to a place (within `maxM`), for things that are not stops (my position, an address) */
export function nearestGroup(data: AppData, p: { lat: number; lon: number }, maxM = 1500): number | null {
  let best: number | null = null, bestM = maxM;
  data.groups.forEach((g, gi) => {
    if (!POS[g.id]) return;
    const m = haversine(p.lat, p.lon, g.lat, g.lon);
    if (m < bestM) { bestM = m; best = gi; }
  });
  return best;
}

/** a direction of a line as a polyline through its stops' dots (repeated groups dropped) */
export function directionPath(data: AppData, line: LineRec, dir: number): XY[] {
  const d = line.directions[dir];
  if (!d) return [];
  const out: XY[] = [];
  let last = -1;
  for (const s of d.stops) {
    const g = data.stops[s].group;
    if (g === last) continue;
    last = g;
    const p = groupXY(data, g);
    if (p) out.push(p);
  }
  return out;
}

/** the bus legs of a trip as polylines on the diagram */
export function tripPaths(data: AppData, it: Itinerary): { routeId: FreeRouteId; pts: XY[] }[] {
  return it.legs.flatMap((l) => {
    if (l.kind !== 'bus') return [];
    const stops = data.timetable.patterns[l.pattern].stops.slice(l.boardPos, l.alightPos + 1);
    const pts = stops.map((s) => stopXY(data, s)).filter((p): p is XY => !!p);
    return pts.length > 1 ? [{ routeId: l.routeId, pts }] : [];
  });
}

/** where along a→b (0..1) the point p is, and how far from that straight segment (metres, roughly) */
function along(p: { lat: number; lon: number }, a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const qx = ax + t * dx, qy = ay + t * dy;
  return { t, m: Math.hypot(px - qx, py - qy) * 111_195 };
}

/**
 * A live bus on the diagram: between the two stops of its trip it is between (by its GPS position),
 * at the same fraction of the way. Falls back to the line's stop sequences when the trip is unknown.
 */
export function busXY(data: AppData, v: Vehicle, netFor: (d: string) => Network): XY | null {
  let seqs: number[][];
  const r = resolveVehicleTrip(v, netFor);
  if (r) seqs = [r.net.patterns[r.p].stops];
  else seqs = (data.lines.find((l) => l.routeId === v.routeId)?.directions ?? []).map((d) => d.stops);
  let best: { m: number; xy: XY } | null = null;
  for (const seq of seqs) {
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = data.stops[seq[i]], b = data.stops[seq[i + 1]];
      const pa = stopXY(data, seq[i]), pb = stopXY(data, seq[i + 1]);
      if (!pa || !pb) continue;
      const { t, m } = along(v, a, b);
      if (!best || m < best.m) best = { m, xy: [pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])] };
    }
  }
  return best && best.m < 1500 ? best.xy : null;
}

export function bounds(pts: XY[]): [XY, XY] | null {
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}
