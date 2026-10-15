import {
  BIKE_RENT_SEC, BIKE_RETURN_SEC, MAX_ACCESS_WALK_M, MAX_TRANSFER_WALK_M, bikeSec, haversine, walkSec, type StopRec,
} from '@rb/shared';
import type { BikeStation, Leg, PlaceRef, StopAccess } from './types';

export interface Chain { sec: number; legs: (start: number) => Leg[] }

const placeOf = (s: { lat: number; lon: number; name: string }): PlaceRef => ({ lat: s.lat, lon: s.lon, name: s.name });
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => haversine(a.lat, a.lon, b.lat, b.lon);

function chain(from: PlaceRef, p: BikeStation, d: BikeStation, to: PlaceRef): Chain {
  const m1 = dist(from, p), m2 = dist(p, d), m3 = dist(d, to);
  const w1 = walkSec(m1), ride = BIKE_RENT_SEC + bikeSec(m2) + BIKE_RETURN_SEC, w3 = walkSec(m3);
  return {
    sec: w1 + ride + w3,
    legs: (start) => {
      const out: Leg[] = [];
      let t = start;
      if (m1 >= 1) out.push({ kind: 'walk', from, to: placeOf(p), depart: t, arrive: t + w1, meters: Math.round(m1) });
      t += w1;
      out.push({ kind: 'bike', from: p, to: d, depart: t, arrive: t + ride, meters: Math.round(m2) });
      t += ride;
      if (m3 >= 1) out.push({ kind: 'walk', from: placeOf(d), to, depart: t, arrive: t + w3, meters: Math.round(m3) });
      return out;
    },
  };
}

const pickups = (stations: BikeStation[], near: PlaceRef, maxM: number) => stations.filter((s) => s.bikes > 0 && dist(near, s) <= maxM);
const dropoffs = (stations: BikeStation[], near: PlaceRef, maxM: number) => stations.filter((s) => dist(near, s) <= maxM);

export function bikeOnly(from: PlaceRef, to: PlaceRef, stations: BikeStation[]): Chain | null {
  let best: Chain | null = null;
  for (const p of pickups(stations, from, MAX_ACCESS_WALK_M)) {
    for (const d of dropoffs(stations, to, MAX_ACCESS_WALK_M)) {
      if (d.uid === p.uid) continue;
      const c = chain(from, p, d, to);
      if (!best || c.sec < best.sec) best = c;
    }
  }
  return best;
}

export function bikeAccessOptions(stops: StopRec[], from: PlaceRef, stations: BikeStation[]): StopAccess[] {
  const best = new Map<number, StopAccess>();
  for (const p of pickups(stations, from, MAX_ACCESS_WALK_M)) {
    for (const d of stations) {
      if (d.uid === p.uid) continue;
      stops.forEach((s, i) => {
        if (dist(d, s) > MAX_TRANSFER_WALK_M) return;
        const c = chain(from, p, d, placeOf(s));
        const cur = best.get(i);
        if (!cur || c.sec < cur.sec) best.set(i, { stop: i, sec: c.sec, legs: c.legs });
      });
    }
  }
  return [...best.values()];
}

export function bikeEgressOptions(stops: StopRec[], to: PlaceRef, stations: BikeStation[]): StopAccess[] {
  const best = new Map<number, StopAccess>();
  stops.forEach((s, i) => {
    const sp = placeOf(s);
    for (const p of pickups(stations, sp, MAX_TRANSFER_WALK_M)) {
      for (const d of dropoffs(stations, to, MAX_ACCESS_WALK_M)) {
        if (d.uid === p.uid) continue;
        const c = chain(sp, p, d, to);
        const cur = best.get(i);
        if (!cur || c.sec < cur.sec) best.set(i, { stop: i, sec: c.sec, legs: c.legs });
      }
    }
  });
  return [...best.values()];
}
