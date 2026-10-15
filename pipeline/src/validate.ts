import { FREE_ROUTE_IDS, daysBetween } from '@rb/shared';
import type { BuiltData } from './build';

export function validate(
  data: BuiltData,
  today: string,
  { requiredRoutes = FREE_ROUTE_IDS, minTrips = 150, maxTrips = 600, minDaysLeft = 7 }: {
    requiredRoutes?: readonly string[]; minTrips?: number; maxTrips?: number; minDaysLeft?: number;
  } = {},
): string[] {
  const errors: string[] = [];
  const have = new Set(data.timetable.patterns.map((p) => p.routeId as string));
  for (const r of requiredRoutes) if (!have.has(r)) errors.push(`missing route ${r}`);
  const n = data.meta.tripCount;
  if (n < minTrips || n > maxTrips) errors.push(`trip count ${n} outside ${minTrips}–${maxTrips}`);
  const left = daysBetween(today, data.meta.feedEnd);
  if (!(left >= minDaysLeft)) errors.push(`feed ends in ${left} days (need ≥ ${minDaysLeft})`);
  for (const s of data.stops.stops) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || s.lat === 0 || s.lon === 0) errors.push(`stop ${s.id} has no coordinates`);
  }
  for (const p of data.timetable.patterns) {
    for (const t of p.trips) {
      let last = -1;
      for (let i = 0; i < p.stops.length; i++) {
        if (t.arr[i] < last || t.dep[i] < t.arr[i]) { errors.push(`non-monotonic times in trip ${t.id}`); break; }
        last = t.dep[i];
      }
    }
  }
  return errors;
}
