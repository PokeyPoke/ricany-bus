import { FREE_ROUTE_IDS, type AlertsResponse, type DelaysResponse, type FreeRouteId, type PositionsResponse, type Vehicle } from '@rb/shared';
import type { RawAlert, RawVehicle, TripUpdate } from './pb';

const FREE = new Set<string>(FREE_ROUTE_IDS);

export function filterDelays(feed: { timestamp: number; updates: TripUpdate[] }): DelaysResponse {
  const trips: DelaysResponse['trips'] = {};
  for (const u of feed.updates) {
    const t = u.trip;
    if (!t?.tripId || !t.routeId || !FREE.has(t.routeId)) continue;
    const stops: Record<number, number> = {};
    let last: number | null = null;
    for (const s of u.stopTimeUpdates) {
      const d = s.departureDelay ?? s.arrivalDelay;
      if (s.stopSequence != null && d != null) { stops[s.stopSequence] = d; last = d; }
    }
    trips[t.tripId] = { startDate: t.startDate ?? '', delay: u.delay ?? last ?? 0, stops };
  }
  return { generatedAt: feed.timestamp, trips };
}

const round1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

export function filterPositions(feed: { timestamp: number; vehicles: RawVehicle[] }): PositionsResponse {
  const vehicles: Vehicle[] = [];
  for (const v of feed.vehicles) {
    const t = v.trip;
    if (!t?.tripId || !t.routeId || !FREE.has(t.routeId) || !Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue;
    vehicles.push({
      id: v.id ?? t.tripId, label: v.label ?? '', tripId: t.tripId, routeId: t.routeId as FreeRouteId, startDate: t.startDate ?? '',
      lat: +v.lat!.toFixed(6), lon: +v.lon!.toFixed(6), bearing: round1(v.bearing), speed: round1(v.speed),
      stopSeq: v.stopSeq ?? null, ts: v.ts ?? feed.timestamp,
    });
  }
  return { generatedAt: feed.timestamp, vehicles };
}

const pick = (t: Record<string, string>) => t.cs ?? t[''] ?? Object.values(t)[0] ?? '';

/** Alerts that name at least one free line; Czech text preferred, English kept when present. */
export function filterAlerts(feed: { timestamp: number; alerts: RawAlert[] }): AlertsResponse {
  const alerts: AlertsResponse['alerts'] = [];
  for (const a of feed.alerts) {
    const routes = [...new Set(a.routeIds.filter((r) => FREE.has(r)))] as FreeRouteId[];
    if (!routes.length) continue;
    alerts.push({
      id: a.id, routes, header: pick(a.header), description: pick(a.description), url: pick(a.url),
      headerEn: a.header.en ?? null, descriptionEn: a.description.en ?? null,
      periods: a.periods.map((p) => [p.start, p.end] as [number | null, number | null]),
    });
  }
  return { generatedAt: feed.timestamp, alerts };
}
