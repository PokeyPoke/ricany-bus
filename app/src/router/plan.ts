import { MAX_ACCESS_WALK_M, addDays, daysBetween, haversine, walkSec, type StopRec } from '@rb/shared';
import type { Network } from './network';
import { raptor, type Journey, type RideStep } from './raptor';
import { bikeAccessOptions, bikeEgressOptions, bikeOnly } from './bike';
import type { BikeStation, Itinerary, Leg, PlaceRef, PlanRequest, PlanResult, StopAccess } from './types';

export interface PlanContext { stops: StopRec[]; netFor(date: string): Network }

export const MAX_RESULTS = 4;
const HORIZON = 3 * 3600;
const WALK_ONLY_MAX = 30 * 60;
const ROLLOVER_DAYS = 2;
const MAX_ARRIVE_BY_RUNS = 300;

const placeOf = (s: StopRec): PlaceRef => ({ lat: s.lat, lon: s.lon, name: s.name });

export function walkOptions(stops: StopRec[], place: PlaceRef, dir: 'access' | 'egress', maxM = MAX_ACCESS_WALK_M): StopAccess[] {
  const out: StopAccess[] = [];
  stops.forEach((s, i) => {
    const m = haversine(place.lat, place.lon, s.lat, s.lon);
    if (m > maxM) return;
    const sec = walkSec(m);
    const sp = placeOf(s);
    out.push({
      stop: i, sec,
      legs: (start) => (m < 1 ? [] : [{
        kind: 'walk', from: dir === 'access' ? place : sp, to: dir === 'access' ? sp : place,
        depart: start, arrive: start + sec, meters: Math.round(m),
      }]),
    });
  });
  return out;
}

export function toItinerary(net: Network, j: Journey): Itinerary {
  const legs: Leg[] = [];
  const first = j.steps.find((s): s is RideStep => s.kind === 'ride')!;
  const firstDep = net.patterns[first.p].trips[first.trip].dep[first.boardPos];
  legs.push(...(j.access.legs?.(firstDep - j.access.sec) ?? []));
  let t = firstDep;
  for (const s of j.steps) {
    if (s.kind === 'ride') {
      const p = net.patterns[s.p];
      const tr = p.trips[s.trip];
      legs.push({
        kind: 'bus', routeId: p.routeId, headsign: p.headsign, tripId: tr.id, serviceDate: tr.serviceDate, pattern: s.p,
        boardPos: s.boardPos, alightPos: s.alightPos, boardSeq: p.seq[s.boardPos], alightSeq: p.seq[s.alightPos],
        from: p.stops[s.boardPos], to: p.stops[s.alightPos], depart: tr.dep[s.boardPos], arrive: tr.arr[s.alightPos],
        stopCount: s.alightPos - s.boardPos,
      });
      t = tr.arr[s.alightPos];
    } else {
      const a = net.stops[s.from], b = net.stops[s.to];
      legs.push({ kind: 'walk', from: placeOf(a), to: placeOf(b), depart: t, arrive: t + s.sec, meters: Math.round(haversine(a.lat, a.lon, b.lat, b.lon)) });
      t += s.sec;
    }
  }
  legs.push(...(j.egress.legs?.(t) ?? []));
  return {
    date: net.date, depart: legs[0].depart, arrive: legs[legs.length - 1].arrive, rides: j.rides,
    free: !legs.some((l) => l.kind === 'bike'), legs,
  };
}

const signature = (it: Itinerary) =>
  it.legs.map((l) => (l.kind === 'bus' ? `${l.tripId}@${l.serviceDate}:${l.boardPos}-${l.alightPos}` : l.kind === 'bike' ? `bike${l.from.uid}-${l.to.uid}` : '')).join('|');

function dedupe(list: Itinerary[]): Itinerary[] {
  const seen = new Set<string>();
  return list.filter((it) => { const s = signature(it); if (seen.has(s)) return false; seen.add(s); return true; });
}

function searchForward(ctx: PlanContext, date: string, sec: number, acc: StopAccess[], egr: StopAccess[]): Itinerary[] {
  const net = ctx.netFor(date);
  const out: Itinerary[] = [];
  let t = sec;
  for (let iter = 0; iter < 12 && out.length < MAX_RESULTS * 2 && t < sec + HORIZON; iter++) {
    const js = raptor(net, acc, egr, t);
    if (!js.length) break;
    out.push(...js.map((j) => toItinerary(net, j)));
    t = Math.min(...js.map((j) => j.firstDepart - j.access.sec)) + 60;
  }
  return dedupe(out).sort((a, b) => a.arrive - b.arrive || b.depart - a.depart).slice(0, MAX_RESULTS);
}

function searchArriveBy(ctx: PlanContext, date: string, target: number, acc: StopAccess[], egr: StopAccess[]): Itinerary[] {
  const net = ctx.netFor(date);
  const cands = new Set<number>();
  for (const a of acc) {
    for (const { p, pos } of net.stopPatterns[a.stop]) {
      for (const tr of net.patterns[p].trips) {
        const d = tr.dep[pos] - a.sec;
        if (d <= target && d >= target - HORIZON) cands.add(d);
      }
    }
  }
  const out: Itinerary[] = [];
  for (const d of [...cands].sort((x, y) => y - x).slice(0, MAX_ARRIVE_BY_RUNS)) {
    for (const j of raptor(net, acc, egr, d)) if (j.arrive <= target) out.push(toItinerary(net, j));
    if (dedupe(out).length >= MAX_RESULTS) break;
  }
  return dedupe(out).sort((a, b) => b.depart - a.depart || a.arrive - b.arrive).slice(0, MAX_RESULTS);
}

/** Seconds since req.date midnight, so itineraries on later days compare correctly. */
export const absTime = (baseDate: string, it: Itinerary, field: 'depart' | 'arrive') => daysBetween(baseDate, it.date) * 86400 + it[field];

export function search(ctx: PlanContext, req: PlanRequest, acc: StopAccess[], egr: StopAccess[], rollover: boolean): Itinerary[] {
  if (!acc.length || !egr.length) return [];
  if (req.mode === 'arr') return searchArriveBy(ctx, req.date, req.sec, acc, egr);
  let r = searchForward(ctx, req.date, req.sec, acc, egr);
  for (let d = 1; rollover && !r.length && d <= ROLLOVER_DAYS; d++) r = searchForward(ctx, addDays(req.date, d), 0, acc, egr);
  return r;
}

function walkItinerary(req: PlanRequest, sec: number, meters: number): Itinerary {
  const start = req.mode === 'dep' ? req.sec : req.sec - sec;
  return {
    date: req.date, depart: start, arrive: start + sec, rides: 0, free: true,
    legs: [{ kind: 'walk', from: req.from, to: req.to, depart: start, arrive: start + sec, meters: Math.round(meters) }],
  };
}

export function planTrip(ctx: PlanContext, req: PlanRequest, bikes: BikeStation[] | null): PlanResult {
  const accW = walkOptions(ctx.stops, req.from, 'access');
  const egrW = walkOptions(ctx.stops, req.to, 'egress');
  const directM = haversine(req.from.lat, req.from.lon, req.to.lat, req.to.lon);
  const wsec = walkSec(directM);
  const walk = wsec <= WALK_ONLY_MAX ? walkItinerary(req, wsec, directM) : null;

  let free = search(ctx, req, accW, egrW, true);
  if (walk) {
    free = req.mode === 'dep'
      ? free.filter((it) => absTime(req.date, it, 'arrive') < walk.arrive)
      : free.filter((it) => absTime(req.date, it, 'depart') > walk.depart);
  }
  const bike = planBike(ctx, req, bikes, free, accW, egrW);
  return { free, bike, walk, nearOrigin: accW.length, nearDest: egrW.length };
}

const BIKE_GAIN = 5 * 60;

function planBike(ctx: PlanContext, req: PlanRequest, bikes: BikeStation[] | null, free: Itinerary[], accW: StopAccess[], egrW: StopAccess[]): Itinerary[] {
  if (!bikes?.length) return [];
  const accB = bikeAccessOptions(ctx.stops, req.from, bikes);
  const egrB = bikeEgressOptions(ctx.stops, req.to, bikes);
  const mixed = [...search(ctx, req, accB, egrW, false), ...search(ctx, req, accW, egrB, false)].filter((it) => !it.free);
  const better = req.mode === 'dep'
    ? (it: Itinerary) => !free.length || absTime(req.date, it, 'arrive') <= Math.min(...free.map((f) => absTime(req.date, f, 'arrive'))) - BIKE_GAIN
    : (it: Itinerary) => !free.length || absTime(req.date, it, 'depart') >= Math.max(...free.map((f) => absTime(req.date, f, 'depart'))) + BIKE_GAIN;
  const out = dedupe(mixed.filter(better)).sort((a, b) => a.arrive - b.arrive).slice(0, 2);
  const only = bikeOnly(req.from, req.to, bikes);
  if (only) {
    const start = req.mode === 'dep' ? req.sec : req.sec - only.sec;
    out.push({ date: req.date, depart: start, arrive: start + only.sec, rides: 0, free: false, legs: only.legs(start) });
  }
  return out;
}
