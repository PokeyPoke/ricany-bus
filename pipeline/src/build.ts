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
