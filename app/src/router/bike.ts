import { BIKE_RENT_SEC, BIKE_RETURN_SEC, DETOUR, MAX_ACCESS_WALK_M, MAX_TRANSFER_WALK_M, haversine, type StopRec } from '@rb/shared';
import type { BikeStation, Leg, PlaceRef, StopAccess } from './types';
import { straightWays, type Ways } from './ways';

export interface Chain { sec: number; legs: (start: number) => Leg[] }

const placeOf = (s: { lat: number; lon: number; name: string }): PlaceRef => ({ lat: s.lat, lon: s.lon, name: s.name });
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => haversine(a.lat, a.lon, b.lat, b.lon);

/** w1/w3: straight-line caps of the two walks, used to bound the street searches */
function chain(from: PlaceRef, p: BikeStation, d: BikeStation, to: PlaceRef, ways: Ways, w1M: number, w3M: number): Chain {
  const r1 = ways.walk(from, p, w1M * DETOUR), r2 = ways.bike(p, d), r3 = ways.walk(d, to, w3M * DETOUR);
  const w1 = r1.sec, ride = BIKE_RENT_SEC + r2.sec + BIKE_RETURN_SEC, w3 = r3.sec;
  return {
    sec: w1 + ride + w3,
    legs: (start) => {
      const out: Leg[] = [];
      let t = start;
      if (r1.m >= 1) out.push({ kind: 'walk', from, to: placeOf(p), depart: t, arrive: t + w1, meters: Math.round(r1.m), path: r1.path?.() });
      t += w1;
      out.push({ kind: 'bike', from: p, to: d, depart: t, arrive: t + ride, meters: Math.round(r2.m), path: r2.path?.() });
      t += ride;
      if (r3.m >= 1) out.push({ kind: 'walk', from: placeOf(d), to, depart: t, arrive: t + w3, meters: Math.round(r3.m), path: r3.path?.() });
      return out;
    },
  };
}

const pickups = (stations: BikeStation[], near: PlaceRef, maxM: number) => stations.filter((s) => s.bikes > 0 && dist(near, s) <= maxM);
const dropoffs = (stations: BikeStation[], near: PlaceRef, maxM: number) => stations.filter((s) => dist(near, s) <= maxM);

export function bikeOnly(from: PlaceRef, to: PlaceRef, stations: BikeStation[], ways: Ways = straightWays): Chain | null {
  let best: Chain | null = null;
  for (const p of pickups(stations, from, MAX_ACCESS_WALK_M)) {
    for (const d of dropoffs(stations, to, MAX_ACCESS_WALK_M)) {
      if (d.uid === p.uid) continue;
      const c = chain(from, p, d, to, ways, MAX_ACCESS_WALK_M, MAX_ACCESS_WALK_M);
      if (Number.isFinite(c.sec) && (!best || c.sec < best.sec)) best = c;
    }
  }
  return best;
}

export function bikeAccessOptions(stops: StopRec[], from: PlaceRef, stations: BikeStation[], ways: Ways = straightWays): StopAccess[] {
  const best = new Map<number, StopAccess>();
  for (const p of pickups(stations, from, MAX_ACCESS_WALK_M)) {
    for (const d of stations) {
      if (d.uid === p.uid) continue;
      stops.forEach((s, i) => {
        if (dist(d, s) > MAX_TRANSFER_WALK_M) return;
        const c = chain(from, p, d, placeOf(s), ways, MAX_ACCESS_WALK_M, MAX_TRANSFER_WALK_M);
        if (!Number.isFinite(c.sec)) return;
        const cur = best.get(i);
        if (!cur || c.sec < cur.sec) best.set(i, { stop: i, sec: c.sec, legs: c.legs });
      });
    }
  }
  return [...best.values()];
}

export function bikeEgressOptions(stops: StopRec[], to: PlaceRef, stations: BikeStation[], ways: Ways = straightWays): StopAccess[] {
  const best = new Map<number, StopAccess>();
  stops.forEach((s, i) => {
    const sp = placeOf(s);
    for (const p of pickups(stations, sp, MAX_TRANSFER_WALK_M)) {
      for (const d of dropoffs(stations, to, MAX_ACCESS_WALK_M)) {
        if (d.uid === p.uid) continue;
        const c = chain(sp, p, d, to, ways, MAX_TRANSFER_WALK_M, MAX_ACCESS_WALK_M);
        if (!Number.isFinite(c.sec)) continue;
        const cur = best.get(i);
        if (!cur || c.sec < cur.sec) best.set(i, { stop: i, sec: c.sec, legs: c.legs });
      }
    }
  });
  return [...best.values()];
}
