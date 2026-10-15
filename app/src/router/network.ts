import { addDays, type FreeRouteId, type StopRec, type TimetableFile } from '@rb/shared';

export interface NetTrip { id: string; serviceDate: string; arr: number[]; dep: number[] }
export interface NetPattern { routeId: FreeRouteId; directionId: number; headsign: string; stops: number[]; seq: number[]; trips: NetTrip[] }
export interface Network { date: string; stops: StopRec[]; patterns: NetPattern[]; stopPatterns: { p: number; pos: number }[][] }

export function buildNetwork(stops: StopRec[], tt: TimetableFile, date: string): Network {
  const today = new Set(tt.servicesByDate[date] ?? []);
  const prevDate = addDays(date, -1);
  const prev = new Set(tt.servicesByDate[prevDate] ?? []);
  const patterns: NetPattern[] = tt.patterns.map((p) => {
    const trips: NetTrip[] = [];
    for (const t of p.trips) {
      if (today.has(t.service)) trips.push({ id: t.id, serviceDate: date, arr: t.arr, dep: t.dep });
      if (prev.has(t.service) && t.arr[t.arr.length - 1] >= 86400) {
        trips.push({ id: t.id, serviceDate: prevDate, arr: t.arr.map((x) => x - 86400), dep: t.dep.map((x) => x - 86400) });
      }
    }
    trips.sort((a, b) => a.dep[0] - b.dep[0]);
    return { routeId: p.routeId, directionId: p.directionId, headsign: p.headsign, stops: p.stops, seq: p.seq, trips };
  });
  const stopPatterns = stops.map(() => [] as { p: number; pos: number }[]);
  patterns.forEach((p, pi) => p.stops.forEach((s, pos) => stopPatterns[s].push({ p: pi, pos })));
  return { date, stops, patterns, stopPatterns };
}
