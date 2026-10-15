import { weekday, type FreeRouteId, type TimetableFile } from '@rb/shared';

export type DayType = 'weekday' | 'saturday' | 'sunday';

export const dayTypeOf = (date: string): DayType => {
  const w = weekday(date);
  return w <= 4 ? 'weekday' : w === 5 ? 'saturday' : 'sunday';
};

export function sampleDate(tt: TimetableFile, dayType: DayType, from: string): string | null {
  return Object.keys(tt.servicesByDate).sort().find((d) => d >= from && dayTypeOf(d) === dayType) ?? null;
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
