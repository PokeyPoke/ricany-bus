import { FREE_ROUTE_IDS, addDays, daysBetween } from '@rb/shared';
import type { BuiltData } from './build';

export function validate(
  data: BuiltData,
  today: string,
  { requiredRoutes = FREE_ROUTE_IDS, minTrips = 150, maxTrips = 600, minDaysLeft = 7, minServiceDays = 3 }: {
    requiredRoutes?: readonly string[]; minTrips?: number; maxTrips?: number; minDaysLeft?: number; minServiceDays?: number;
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
  // Calendar sanity: a broken/empty calendar must not silently publish "no service" every day.
  const tripServices = new Set(data.timetable.patterns.flatMap((p) => p.trips.map((t) => t.service)));
  let serviceDays = 0;
  for (let i = 0; i < 10; i++) {
    if ((data.timetable.servicesByDate[addDays(today, i)] ?? []).some((id) => tripServices.has(id))) serviceDays++;
  }
  if (serviceDays < minServiceDays) errors.push(`only ${serviceDays} of the next 10 days have service (need ≥ ${minServiceDays})`);
  for (const p of data.timetable.patterns) {
    for (const t of p.trips) {
      if (![...t.arr, ...t.dep].every(Number.isFinite)) { errors.push(`non-finite times in trip ${t.id}`); continue; }
      let last = -1;
      for (let i = 0; i < p.stops.length; i++) {
        if (t.arr[i] < last || t.dep[i] < t.arr[i]) { errors.push(`non-monotonic times in trip ${t.id}`); break; }
        last = t.dep[i];
      }
    }
  }
  return errors;
}
