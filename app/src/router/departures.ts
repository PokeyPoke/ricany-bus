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
