import { LINE_STYLE, type LineRec, type StopRec, type StopGroup } from '@rb/shared';
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

export const groupsGeoJson = (groups: StopGroup[]) =>
  fc(groups.map((g, gi) => point(g.lon, g.lat, { gi, id: g.id, name: g.name, ring: 'ring-' + g.lines.join('-') })));

/** Stops of one line direction, one point per stop group in travel order, numbered 1..n. */
export function lineStopsGeoJson(groups: StopGroup[], stops: StopRec[], line: LineRec, directionId: number): FC {
  const dir = line.directions.find((d) => d.directionId === directionId);
  if (!dir) return fc([]);
  const seen = new Set<number>();
  const features: Feature[] = [];
  for (const stopIdx of dir.stops) {
    const gi = stops[stopIdx].group;
    if (seen.has(gi)) continue;
    seen.add(gi);
    const n = features.length + 1;
    features.push(point(groups[gi].lon, groups[gi].lat, { gi, n, color: line.color, text: line.text, stopIdx, number: line.number, directionId }));
  }
  return fc(features);
}

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
