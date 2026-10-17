import { LINE_STYLE, type Vehicle, type LineRec, type StopRec, type StopGroup } from '@rb/shared';
import { alongShape } from './motion';
import { parallelRuns } from './parallel';
import { ringKey } from './rings';
import type { AppData } from '../lib/data';
import type { BikeStation, Itinerary } from '../router/types';

export interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] };
  properties: Record<string, string | number | number[]>;
}
export interface FC { type: 'FeatureCollection'; features: Feature[] }

const fc = (features: Feature[]): FC => ({ type: 'FeatureCollection', features });
const point = (lon: number, lat: number, properties: Feature['properties']): Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties });
const lineStr = (coordinates: [number, number][], properties: Feature['properties']): Feature => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties });

export const linesGeoJson = (lines: LineRec[]) =>
  fc(lines.flatMap((l) => l.directions.map((d, dir) => lineStr(d.shape, { routeId: l.routeId, number: l.number, color: l.color, dir }))));

/** Lines drawn side by side where they share a road: `off` is the offset in line widths (see parallel.ts). */
export function parallelLinesGeoJson(lines: LineRec[]): FC {
  const byId = new Map(lines.map((l) => [l.routeId, l]));
  return fc(parallelRuns(lines).map((r) => {
    const l = byId.get(r.routeId)!;
    return lineStr(r.coords, { routeId: l.routeId, number: l.number, color: l.color, dir: r.dir, off: r.off });
  }));
}

export const groupsGeoJson = (groups: StopGroup[]) =>
  fc(groups.map((g, gi) => point(g.lon, g.lat, { gi, id: g.id, name: g.name, ring: ringKey(g.lines) })));

/** Stops of one line direction (index `dirIdx` into line.directions), one point per stop group in travel order, numbered 1..n. */
export function lineStopsGeoJson(groups: StopGroup[], stops: StopRec[], line: LineRec, dirIdx: number): FC {
  const dir = line.directions[dirIdx];
  if (!dir) return fc([]);
  const seen = new Set<number>();
  const features: Feature[] = [];
  for (const stopIdx of dir.stops) {
    const gi = stops[stopIdx].group;
    if (seen.has(gi)) continue;
    seen.add(gi);
    const n = features.length + 1;
    features.push(point(groups[gi].lon, groups[gi].lat, { gi, n, color: line.color, text: line.text, stopIdx, number: line.number, dir: dirIdx }));
  }
  return fc(features);
}

export const bikesGeoJson = (stations: BikeStation[]) => fc(stations.map((b) => point(b.lon, b.lat, { uid: b.uid, name: b.name, bikes: b.bikes })));

/** Orbit radius (px) of the direction arrow around the bus icon centre. */
export const ARROW_ORBIT = 34;

/**
 * icon-offset for the direction arrow. MapLibre rotates icon-offset together with icon-rotate, so the wanted screen
 * vector (displacement + orbit along the travel direction) is pre-rotated by the inverse angle.
 */
export function arrowOffset(disp: [number, number], bearing: number, mapBearing = 0, orbit = ARROW_ORBIT): [number, number] {
  const a = ((bearing - mapBearing) * Math.PI) / 180;
  const vx = disp[0] + orbit * Math.sin(a), vy = disp[1] - orbit * Math.cos(a);
  return [vx * Math.cos(a) + vy * Math.sin(a), -vx * Math.sin(a) + vy * Math.cos(a)];
}

/** offsets: screen-pixel displacement per tripId (from spreadOffsets). */
/** `waiting`: trip ids of buses whose trip has not started yet (drawn faded).
 * `scale`: the zoom-dependent icon size (busScale); maplibre multiplies icon offsets by it, so pixel offsets are divided here. */
export const busesGeoJson = (vehicles: Vehicle[], offsets: Record<string, [number, number]> = {}, mapBearing = 0, waiting: ReadonlySet<string> = new Set(), scale = 1) => fc(vehicles.map((v) => {
  const s = LINE_STYLE[v.routeId];
  const px = offsets[v.tripId] ?? [0, 0];
  const d: [number, number] = [px[0] / scale, px[1] / scale];
  const bearing = v.bearing ?? -1;
  return point(v.lon, v.lat, {
    tripId: v.tripId, routeId: v.routeId, number: s.number, color: s.color, text: s.text, bearing, waiting: waiting.has(v.tripId) ? 1 : 0,
    off: d, disp: Math.hypot(d[0], d[1]), aoff: bearing >= 0 ? arrowOffset(d, bearing, mapBearing) : [0, 0],
  });
}));

export function tripGeoJson(it: Itinerary, data: AppData): FC {
  return fc(it.legs.map((l) => {
    if (l.kind === 'bus') {
      const p = data.timetable.patterns[l.pattern];
      const pts = p.stops.slice(l.boardPos, l.alightPos + 1).map((i) => [data.stops[i].lon, data.stops[i].lat] as [number, number]);
      const shapes = data.lines.find((x) => x.routeId === l.routeId)?.directions.map((d) => d.shape) ?? [];
      // stop to stop along the line's shape (straight where no shape fits), so loops and bends are drawn as driven
      const coords: [number, number][] = [pts[0]];
      for (let k = 1; k < pts.length; k++) {
        for (const c of (alongShape(shapes, pts[k - 1], pts[k]) ?? [pts[k - 1], pts[k]]).slice(1)) {
          const last = coords[coords.length - 1];
          if (c[0] !== last[0] || c[1] !== last[1]) coords.push(c);
        }
      }
      return lineStr(coords, { kind: 'bus', color: LINE_STYLE[l.routeId].color });
    }
    return lineStr(l.path ?? [[l.from.lon, l.from.lat], [l.to.lon, l.to.lat]], { kind: l.kind, color: l.kind === 'bike' ? '#2e9d4a' : '#555555' });
  }));
}

export function bbox(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}
