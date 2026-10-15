import { FREE_ROUTE_IDS, type DelaysResponse } from '@rb/shared';
import type { TripUpdate } from './pb';

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
