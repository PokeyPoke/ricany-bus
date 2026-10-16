import { addDays, type FreeRouteId, type StopRec, type TimetableFile } from '@rb/shared';
import type { Network } from './network';

export interface DirectRide { tripId: string; serviceDate: string; date: string; p: number; boardPos: number; alightPos: number; dep: number; arr: number; boardSeq: number; alightSeq: number; headsign: string }

export function directRides(
  netFor: (d: string) => Network, date: string, fromSec: number, routeId: FreeRouteId, directionId: number,
  fromStops: number[], toStops: number[], limit = 6, maxDays = 2,
): DirectRide[] {
  const from = new Set(fromStops);
  const to = new Set(toStops);
  const out: DirectRide[] = [];
  for (let day = 0; day < maxDays && out.length === 0; day++) {
    const net = netFor(addDays(date, day));
    const sec = day === 0 ? fromSec : 0;
    const found: DirectRide[] = [];
    net.patterns.forEach((pat, p) => {
      if (pat.routeId !== routeId || pat.directionId !== directionId) return;
      for (const t of pat.trips) {
        for (let b = 0; b < pat.stops.length - 1; b++) {
          if (!from.has(pat.stops[b]) || t.dep[b] < sec) continue;
          let j = b + 1;
          while (j < pat.stops.length && !to.has(pat.stops[j])) j++;
          if (j >= pat.stops.length) continue;
          found.push({
            tripId: t.id, serviceDate: t.serviceDate, date: net.date, p, boardPos: b, alightPos: j, dep: t.dep[b], arr: t.arr[j],
            boardSeq: pat.seq[b], alightSeq: pat.seq[j], headsign: pat.headsign,
          });
          break;
        }
      }
    });
    found.sort((a, b) => a.dep - b.dep);
    out.push(...found);
  }
  return out.slice(0, limit);
}

export interface Downstream { group: number; name: string; minutes: number }

export function downstreamStops(
  tt: TimetableFile, stops: StopRec[], routeId: FreeRouteId, directionId: number, ordered: number[], fromStops: number[],
): Downstream[] {
  const from = new Set(fromStops);
  const b0 = ordered.findIndex((s) => from.has(s));
  if (b0 < 0) return [];
  const pats = tt.patterns.filter((p) => p.routeId === routeId && p.directionId === directionId && p.trips.length > 0);
  const seen = new Set<number>();
  const out: Downstream[] = [];
  for (const s of ordered.slice(b0 + 1)) {
    let minutes: number | null = null;
    for (const pat of pats) {
      for (let j = 0; j < pat.stops.length && minutes === null; j++) {
        if (pat.stops[j] !== s) continue;
        for (let b = 0; b < j; b++) {
          if (from.has(pat.stops[b])) { minutes = Math.round((pat.trips[0].arr[j] - pat.trips[0].dep[b]) / 60); break; }
        }
      }
      if (minutes !== null) break;
    }
    if (minutes === null) continue;
    const g = stops[s].group;
    if (seen.has(g)) continue;
    seen.add(g);
    out.push({ group: g, name: stops[s].name, minutes });
  }
  return out;
}
