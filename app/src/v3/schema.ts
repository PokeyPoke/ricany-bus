import { haversine, type FreeRouteId, type LineRec, type Vehicle } from '@rb/shared';
import type { AppData } from '../lib/data';
import type { Itinerary } from '../router/types';
import { resolveVehicleTrip } from '../lib/live';
import type { Network } from '../router/network';
import STOPS from './schemaStops.json';
import PATHS from './schemaPaths.json';

/**
 * The city's line diagram (schema-linek-MHD.pdf, as SVG in /schema/linky.svg) used as the map.
 * Coordinates are the diagram's own points (733.65 × 529.56); every stop group has its dot's centre,
 * read from the PDF's vector drawing and checked by eye (scripts/schema).
 */
export const SCHEMA_W = 733.654;
export const SCHEMA_H = 529.559;
export type XY = [number, number];
const POS = STOPS as unknown as Record<string, XY>;
/**
 * The drawn line between two consecutive stops of a route (`L1731:U1881Z11>U1883Z11`), traced along the
 * diagram's own strokes of that line's colour, and where each stop sits on that line (`L1731:U1881Z11`):
 * in a bundle of parallel lines a stop's dot is on one of them, its name between them.
 */
const LINES = PATHS as unknown as { at: Record<string, XY>; paths: Record<string, XY[]> };

/** the part of the diagram with the network on it (the cleaned SVG keeps the page size, so positions stay valid) */
export const SCHEMA_CONTENT: [XY, XY] = [[88, 46], [702, 452]];

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

/** a stop group on a route's own line (or its dot when the line was not traced there) */
const onLine = (routeId: string, gid: string): XY | null => LINES.at[`${routeId}:${gid}`] ?? POS[gid] ?? null;
/** the drawn line from one stop to the next (straight when it could not be traced) */
function hop(routeId: string, a: string, b: string): XY[] {
  const traced = LINES.paths[`${routeId}:${a}>${b}`];
  if (traced) return traced;
  const pa = onLine(routeId, a), pb = onLine(routeId, b);
  return pa && pb ? [pa, pb] : [];
}

export type SchemaPath = { routeId: FreeRouteId; pts: XY[]; stops: XY[] };
/** a route through stops (indices into data.stops) as the diagram draws it, with its stops on that line */
function traced(data: AppData, routeId: FreeRouteId, stopIdx: number[]): SchemaPath {
  const gids: string[] = [];
  for (const s of stopIdx) {
    const id = data.groups[data.stops[s].group]?.id;
    if (id && POS[id] && id !== gids[gids.length - 1]) gids.push(id);
  }
  const pts: XY[] = [];
  for (let i = 0; i + 1 < gids.length; i++) {
    const h = hop(routeId, gids[i], gids[i + 1]);
    pts.push(...(pts.length ? h.slice(1) : h));
  }
  const stops = gids.map((g) => onLine(routeId, g)).filter((p): p is XY => !!p);
  return { routeId, pts: pts.length > 1 ? pts : stops, stops };
}

/** a direction of a line along its drawn line */
export function directionPath(data: AppData, line: LineRec, dir: number): SchemaPath | null {
  const d = line.directions[dir];
  return d ? traced(data, line.routeId, d.stops) : null;
}

/** the bus legs of a trip along their drawn lines */
export function tripPaths(data: AppData, it: Itinerary): SchemaPath[] {
  return it.legs.flatMap((l) => {
    if (l.kind !== 'bus') return [];
    const p = traced(data, l.routeId, data.timetable.patterns[l.pattern].stops.slice(l.boardPos, l.alightPos + 1));
    return p.pts.length > 1 ? [p] : [];
  });
}

/** the point a fraction t (0..1) of the way along a polyline */
function at(pts: XY[], t: number): XY {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = t * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (left <= segs[i] || i === segs.length - 1) {
      const k = segs[i] > 0 ? Math.min(1, left / segs[i]) : 0;
      return [pts[i][0] + k * (pts[i + 1][0] - pts[i][0]), pts[i][1] + k * (pts[i + 1][1] - pts[i][1])];
    }
    left -= segs[i];
  }
  return pts[0];
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
 * at the same fraction of the way along the drawn line. Falls back to the line's stop sequences when the trip is unknown.
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
      const ga = data.groups[a.group]?.id, gb = data.groups[b.group]?.id;
      if (!ga || !gb || !POS[ga] || !POS[gb]) continue;
      const { t, m } = along(v, a, b);
      if (best && m >= best.m) continue;
      const h = ga === gb ? [POS[ga]] : hop(v.routeId, ga, gb);
      if (h.length) best = { m, xy: h.length > 1 ? at(h, t) : h[0] };
    }
  }
  return best && best.m < 1500 ? best.xy : null;
}

export function bounds(pts: XY[]): [XY, XY] | null {
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}
