import { describe, it, expect } from 'vitest';
import { StreetGraph, WALK, BIKE_FWD, BIKE_BACK, haversine, walkSec, type StreetsFile } from '@rb/shared';
import { straightWays, streetWays } from '../src/router/ways';
import { walkOptions, planTrip } from '../src/router/plan';
import { stops, timetable, H } from './fixtures/net';
import { buildNetwork } from '../src/router/network';

// A U-shaped street: O (49.999, 14.65) → east 0.9 km → south 1 km → west to stop S0 (49.99, 14.65).
const P: [number, number][] = [[49.999, 14.65], [49.999, 14.6626], [49.99, 14.6626], [49.99, 14.65]];
const ALL = WALK | BIKE_FWD | BIKE_BACK;
const file: StreetsFile = {
  v: 1, generatedAt: '',
  nodes: P.flatMap(([la, lo]) => [Math.round(la * 1e5), Math.round(lo * 1e5)]),
  edges: [0, 1, ALL, 1, 2, ALL, 2, 3, ALL],
  geom: [[], [], []],
};
const g = new StreetGraph(file);
const O = { lat: 49.999, lon: 14.65, name: 'O' };
const S0 = { lat: stops[0].lat, lon: stops[0].lon };
const around = haversine(...P[0], ...P[1]) + haversine(...P[1], ...P[2]) + haversine(...P[2], ...P[3]);

describe('streetWays', () => {
  it('measures along the street and returns the path', () => {
    const r = streetWays(g).walk(O, S0);
    expect(r.m).toBeCloseTo(around, -1);
    expect(r.sec).toBe(walkSec(r.m, false));
    const p = r.path!()!;
    expect(p[0]).toEqual([14.65, 49.999]);
    expect(p.some(([lon]) => lon > 14.66)).toBe(true);
  });
  it('reuses the destination tree when walking towards it, with the path in travel order', () => {
    const w = streetWays(g);
    w.walk(S0, O); // grows a tree from S0
    const p = w.walk(O, S0).path!()!;
    expect(p[0]).toEqual([14.65, 49.999]);
    expect(p[p.length - 1][1]).toBeCloseTo(49.99, 5);
  });
  it('falls back to the straight-line estimate off the street network', () => {
    const far = { lat: 50.03, lon: 14.6 };
    const r = streetWays(g).walk(O, far);
    expect(r).toEqual(straightWays.walk(O, far));
    expect(r.path).toBeUndefined();
  });
});

describe('planner with streets', () => {
  it('drops a stop that is close in a straight line but a long walk round', () => {
    expect(walkOptions(stops, O, 'access').map((a) => a.stop)).toContain(0);
    expect(walkOptions(stops, O, 'access', undefined, streetWays(g)).map((a) => a.stop)).not.toContain(0);
  });
  it('walk legs carry the street path and street meters', () => {
    const ctx = { stops, netFor: (d: string) => buildNetwork(stops, timetable, d), streets: g };
    const start = { lat: 49.99, lon: 14.655, name: 'start' }; // on the street, 360 m east of S0
    const r = planTrip(ctx, { from: start, to: { lat: stops[5].lat, lon: stops[5].lon, name: 'S5' }, mode: 'dep', date: '20261019', sec: H(7, 50) }, null);
    const leg = r.free[0].legs[0];
    expect(leg.kind).toBe('walk');
    if (leg.kind !== 'walk') return;
    expect(leg.path?.length).toBeGreaterThanOrEqual(2);
    expect(leg.path![0]).toEqual([14.655, 49.99]);
    expect(leg.meters).toBe(Math.round(haversine(49.99, 14.655, 49.99, 14.65)));
  });
});
