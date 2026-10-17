import { weekday, type FreeRouteId, type TimetableFile } from '@rb/shared';

export type DayType = 'weekday' | 'saturday' | 'sunday';

export const dayTypeOf = (date: string): DayType => {
  const w = weekday(date);
  return w <= 4 ? 'weekday' : w === 5 ? 'saturday' : 'sunday';
};

export function sampleDate(tt: TimetableFile, dayType: DayType, from: string): string | null {
  const dates = Object.keys(tt.servicesByDate).sort();
  const key = (d: string) => [...tt.servicesByDate[d]].sort().join('|');
  // A weekday holiday (e.g. 28.10.) runs the Saturday timetable and must not represent "Po–Pá".
  const sat = dates.find((d) => d >= from && dayTypeOf(d) === 'saturday' && tt.servicesByDate[d].length > 0)
    ?? dates.find((d) => dayTypeOf(d) === 'saturday' && tt.servicesByDate[d].length > 0);
  const satKey = sat ? key(sat) : null;
  return dates.find((d) => d >= from && dayTypeOf(d) === dayType && tt.servicesByDate[d].length > 0
    && !(dayType === 'weekday' && satKey !== null && key(d) === satKey)) ?? null;
}

export function stopTimetable(tt: TimetableFile, routeId: FreeRouteId, directionId: number, stop: number, date: string): Map<number, number[]> {
  const active = new Set(tt.servicesByDate[date] ?? []);
  const times: number[] = [];
  for (const p of tt.patterns) {
    if (p.routeId !== routeId || p.directionId !== directionId) continue;
    p.stops.forEach((s, pos) => {
      if (s !== stop || pos === p.stops.length - 1) return;
      for (const t of p.trips) if (active.has(t.service)) times.push(t.dep[pos]);
    });
  }
  const out = new Map<number, number[]>();
  for (const t of [...new Set(times)].sort((a, b) => a - b)) {
    const h = Math.floor(t / 3600) % 24;
    const m = Math.floor((t % 3600) / 60);
    if (!out.has(h)) out.set(h, []);
    out.get(h)!.push(m);
  }
  return out;
}

/** Lines with at least one trip on the service day `date`. */
export function linesRunningOn(tt: TimetableFile, date: string): Set<FreeRouteId> {
  const active = new Set(tt.servicesByDate[date] ?? []);
  const out = new Set<FreeRouteId>();
  for (const p of tt.patterns) if (!out.has(p.routeId) && p.trips.some((t) => active.has(t.service))) out.add(p.routeId);
  return out;
}

/** The first free-line departure on the next day after `date` that has service (scans the timetable's dates). */
export function nextServiceStart(tt: TimetableFile, date: string): { date: string; sec: number; routeId: FreeRouteId } | null {
  for (const d of Object.keys(tt.servicesByDate).filter((x) => x > date).sort()) {
    const active = new Set(tt.servicesByDate[d]);
    let best: { date: string; sec: number; routeId: FreeRouteId } | null = null;
    for (const p of tt.patterns) {
      for (const t of p.trips) if (active.has(t.service) && (!best || t.dep[0] < best.sec)) best = { date: d, sec: t.dep[0], routeId: p.routeId };
    }
    if (best) return best;
  }
  return null;
}
