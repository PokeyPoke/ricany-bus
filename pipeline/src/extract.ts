import { FREE_ROUTE_IDS, type FreeRouteId } from '@rb/shared';
import type { GtfsSource, Row } from './source';

export interface RawStopTime { seq: number; stopId: string; arr: number; dep: number }
export interface RawTrip {
  id: string; routeId: FreeRouteId; serviceId: string; directionId: number;
  headsign: string; shapeId: string; stopTimes: RawStopTime[];
}
export interface RawFree {
  routes: Map<FreeRouteId, { longName: string }>;
  trips: RawTrip[];
  stops: Map<string, { name: string; platform: string; lat: number; lon: number; wheelchair: number }>;
  calendar: Row[];
  calendarDates: Row[];
  shapes: Map<string, [number, number][]>;
  feedInfo: { start: string; end: string };
}

export function parseTime(t: string): number {
  const [h, m, s] = t.trim().split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

export async function extractFree(src: GtfsSource): Promise<RawFree> {
  const free = new Set<string>(FREE_ROUTE_IDS);

  const routes = new Map<FreeRouteId, { longName: string }>();
  for await (const r of src.rows('routes.txt')) {
    if (free.has(r.route_id)) routes.set(r.route_id as FreeRouteId, { longName: r.route_long_name });
  }

  const trips = new Map<string, RawTrip>();
  for await (const r of src.rows('trips.txt')) {
    if (!free.has(r.route_id)) continue;
    trips.set(r.trip_id, {
      id: r.trip_id, routeId: r.route_id as FreeRouteId, serviceId: r.service_id,
      directionId: Number(r.direction_id || 0), headsign: r.trip_headsign ?? '',
      shapeId: r.shape_id ?? '', stopTimes: [],
    });
  }

  const stopIds = new Set<string>();
  for await (const r of src.rows('stop_times.txt')) {
    const t = trips.get(r.trip_id);
    if (!t) continue;
    t.stopTimes.push({
      seq: Number(r.stop_sequence), stopId: r.stop_id,
      arr: parseTime(r.arrival_time || r.departure_time),
      dep: parseTime(r.departure_time || r.arrival_time),
    });
    stopIds.add(r.stop_id);
  }
  for (const t of trips.values()) t.stopTimes.sort((a, b) => a.seq - b.seq);

  const stops = new Map<string, { name: string; platform: string; lat: number; lon: number; wheelchair: number }>();
  for await (const r of src.rows('stops.txt')) {
    if (stopIds.has(r.stop_id)) {
      stops.set(r.stop_id, { name: r.stop_name, platform: r.platform_code ?? '', lat: Number(r.stop_lat), lon: Number(r.stop_lon), wheelchair: Number(r.wheelchair_boarding) || 0 });
    }
  }

  const services = new Set([...trips.values()].map((t) => t.serviceId));
  const calendar: Row[] = [];
  for await (const r of src.rows('calendar.txt')) if (services.has(r.service_id)) calendar.push(r);
  const calendarDates: Row[] = [];
  for await (const r of src.rows('calendar_dates.txt')) if (services.has(r.service_id)) calendarDates.push(r);

  const shapeIds = new Set([...trips.values()].map((t) => t.shapeId).filter(Boolean));
  const pts = new Map<string, [number, number, number][]>();
  for await (const r of src.rows('shapes.txt')) {
    if (!shapeIds.has(r.shape_id)) continue;
    let a = pts.get(r.shape_id);
    if (!a) pts.set(r.shape_id, (a = []));
    a.push([Number(r.shape_pt_sequence), Number(r.shape_pt_lon), Number(r.shape_pt_lat)]);
  }
  const shapes = new Map<string, [number, number][]>();
  for (const [id, a] of pts) shapes.set(id, a.sort((x, y) => x[0] - y[0]).map((p) => [p[1], p[2]]));

  let feedInfo = { start: '', end: '' };
  for await (const r of src.rows('feed_info.txt')) feedInfo = { start: r.feed_start_date, end: r.feed_end_date };

  return {
    routes,
    trips: [...trips.values()].filter((t) => t.stopTimes.length >= 2),
    stops, calendar, calendarDates, shapes, feedInfo,
  };
}
