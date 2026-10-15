import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { planTrip, type PlanContext } from '../src/router/plan';
import type { PlaceRef } from '../src/router/types';
import { stops, timetable, H } from './fixtures/net';

const ctx: PlanContext = { stops, netFor: (d) => buildNetwork(stops, timetable, d) };
const at = (i: number, northM = 0): PlaceRef => ({ lat: stops[i].lat + northM / 111195, lon: stops[i].lon, name: 'p' + i });
const dep = (from: PlaceRef, to: PlaceRef, sec: number, date = '20261019') => planTrip(ctx, { from, to, mode: 'dep', date, sec }, null);

describe('planTrip', () => {
  it('returns free itineraries sorted by arrival, without zero-length walks', () => {
    const r = dep(at(0), at(5), H(7, 55));
    expect(r.free.map((f) => f.arrive)).toEqual([H(8, 33), H(9, 0)]);
    expect(r.free.every((f) => f.free && f.date === '20261019')).toBe(true);
    expect(r.free[0].legs.map((l) => l.kind)).toEqual(['bus', 'bus']);
    expect(r.free[0].depart).toBe(H(8, 0));
    expect(r.nearOrigin).toBe(1);
    expect(r.walk).toBeNull();
  });
  it('builds walk legs for access, transfers and egress', () => {
    const r = dep(at(0, -300), at(4, 200), H(7, 50));
    const it0 = r.free[0];
    expect(it0.legs.map((l) => l.kind)).toEqual(['walk', 'bus', 'walk', 'bus', 'walk']);
    const first = it0.legs[0];
    expect(first.arrive).toBe(H(8, 0));
    expect(first.kind === 'walk' && first.meters).toBe(300);
    expect(it0.arrive).toBeGreaterThan(H(8, 21));
  });
  it('arrive-by picks the latest departure that arrives in time', () => {
    const r = planTrip(ctx, { from: at(0), to: at(5), mode: 'arr', date: '20261019', sec: H(8, 40) }, null);
    expect(r.free.length).toBe(1);
    expect(r.free[0]).toMatchObject({ depart: H(8, 0), arrive: H(8, 33), rides: 2 });
  });
  it('rolls over to the next day when nothing runs today (evening and Sunday)', () => {
    const evening = dep(at(0), at(5), H(22, 0));
    expect(evening.free[0]).toMatchObject({ date: '20261020', arrive: H(8, 33) });
    expect(evening.free.map((f) => f.arrive)).toEqual([H(8, 33), H(9, 0)]);
    // horizon counts from the first bus found after rollover, not from midnight: later buses are still listed
    const sparse = dep(at(0), at(2), H(22, 0));
    expect(sparse.free.map((f) => [f.date, f.arrive])).toEqual([['20261020', H(8, 10)], ['20261020', H(8, 40)]]);
    const sunday = dep(at(0), at(5), H(10, 0), '20261018');
    expect(sunday.free[0]).toMatchObject({ date: '20261019', arrive: H(8, 33) });
  });
  it('drops bus trips slower than walking and offers walk-only', () => {
    const r = dep(at(0), at(0, 500), H(7, 55));
    expect(r.walk).not.toBeNull();
    expect(r.walk!.legs.length).toBe(1);
    expect(r.walk!.arrive - r.walk!.depart).toBe(520);
    expect(r.free).toEqual([]);
  });
  it('reports no nearby stops', () => {
    const r = dep({ lat: 49.9, lon: 14.65, name: 'far' }, at(5), H(7, 55));
    expect(r.nearOrigin).toBe(0);
    expect(r.free).toEqual([]);
    expect(r.walk).toBeNull();
  });
});
