import type { FreeRouteId } from '@rb/shared';
import type { Network } from './network';

export interface Departure { p: number; pos: number; tripId: string; serviceDate: string; routeId: FreeRouteId; headsign: string; dep: number; seq: number }

export function departuresAt(net: Network, stop: number, fromSec: number, limit: number): Departure[] {
  const out: Departure[] = [];
  for (const { p, pos } of net.stopPatterns[stop]) {
    const pat = net.patterns[p];
    if (pos === pat.stops.length - 1) continue;
    for (const t of pat.trips) {
      if (t.dep[pos] >= fromSec) {
        out.push({ p, pos, tripId: t.id, serviceDate: t.serviceDate, routeId: pat.routeId, headsign: pat.headsign, dep: t.dep[pos], seq: pat.seq[pos] });
      }
    }
  }
  return out.sort((a, b) => a.dep - b.dep).slice(0, limit);
}

/** Board filter: keep departures whose delay-adjusted time is not more than a minute past, order by that time, then limit. */
export function boardWindow<T extends { dep: number }>(list: T[], nowSec: number, delayOf: (d: T) => number | null, limit: number): T[] {
  const adj = (d: T) => d.dep + (delayOf(d) ?? 0);
  return list.filter((d) => adj(d) >= nowSec - 60).sort((a, b) => adj(a) - adj(b)).slice(0, limit);
}
