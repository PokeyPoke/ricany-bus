import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { planTrip, type PlanContext } from '../src/router/plan';
import { bikeOnly, bikeAccessOptions } from '../src/router/bike';
import type { BikeStation, PlaceRef } from '../src/router/types';
import { stops, timetable, H } from './fixtures/net';

const ctx: PlanContext = { stops, netFor: (d) => buildNetwork(stops, timetable, d) };
const at = (i: number, northM = 0): PlaceRef => ({ lat: stops[i].lat + northM / 111195, lon: stops[i].lon, name: 'p' + i });
const station = (uid: number, p: PlaceRef, bikes: number): BikeStation => ({ uid, name: 'B' + uid, lat: p.lat, lon: p.lon, bikes, freeRacks: 5 });
const stations = [station(1, at(0, 50), 3), station(2, at(5, -50), 0), station(3, at(2, 30), 2)];

describe('bikeOnly', () => {
  it('walk → ride → walk between the best stations', () => {
    const c = bikeOnly(at(0), at(5), stations)!;
    expect(c).not.toBeNull();
    const legs = c.legs(H(8, 0));
    expect(legs.map((l) => l.kind)).toEqual(['walk', 'bike', 'walk']);
    const b = legs[1];
    expect(b.kind === 'bike' && [b.from.uid, b.to.uid]).toEqual([1, 2]);
    expect(c.sec).toBeGreaterThan(2200);
    expect(c.sec).toBeLessThan(2400);
    expect(legs[2].arrive - H(8, 0)).toBe(c.sec);
  });
  it('needs a pickup station with bikes now', () => {
    expect(bikeOnly(at(0), at(5), [station(1, at(0, 50), 0), station(2, at(5, -50), 4)])).toBeNull();
  });
});

describe('bikeAccessOptions', () => {
  it('reaches stops within 400 m of a drop-off station', () => {
    const opts = bikeAccessOptions(stops, at(0), stations);
    expect(opts.map((o) => o.stop).sort()).toEqual([2, 3, 5]);
  });
});

describe('planTrip with bikes', () => {
  it('hides paid options that are not ≥ 5 min better than the free ones', () => {
    const r = planTrip(ctx, { from: at(0), to: at(5), mode: 'dep', date: '20261019', sec: H(7, 55) }, stations);
    expect(r.free.length).toBeGreaterThan(0);
    expect(r.bike).toEqual([]);
  });
  it('offers bike + bus when it clearly beats the free option', () => {
    const r = planTrip(ctx, { from: at(0), to: at(5), mode: 'dep', date: '20261019', sec: H(8, 1) }, stations);
    expect(r.free[0].date).toBe('20261020'); // free trips only tomorrow
    expect(r.bike.some((it) => it.rides === 0)).toBe(true); // bike-only beats waiting for tomorrow's bus
    const mixed = r.bike.filter((it) => it.rides > 0);
    expect(mixed.some((it) => it.date === '20261019' && it.arrive === H(8, 33))).toBe(true);
    for (const it of r.bike) {
      expect(it.free).toBe(false);
      expect(it.legs.filter((l) => l.kind === 'bike').length).toBe(1);
    }
  });
  it('offers no bike for a short walk, even when no bus helps', () => {
    // 600 m on foot, with a pickup station at the start and a drop-off near the end
    const near = [station(1, at(0, 20), 3), station(4, at(0, 580), 0)];
    const r = planTrip(ctx, { from: at(0), to: at(0, 600), mode: 'dep', date: '20261019', sec: H(11, 0) }, near);
    expect(r.walk).not.toBeNull();
    expect(r.bike).toEqual([]);
  });
  it('without bike data returns no bike options', () => {
    expect(planTrip(ctx, { from: at(0), to: at(5), mode: 'dep', date: '20261019', sec: H(7, 55) }, null).bike).toEqual([]);
  });
});
