import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { raptor } from '../src/router/raptor';
import { stops, timetable, H } from './fixtures/net';
import type { Network } from '../src/router/network';

const net = buildNetwork(stops, timetable, '20261019');
const at = (stop: number) => [{ stop, sec: 0 }];

describe('buildNetwork', () => {
  it('includes only trips active on the date, plus previous-day trips past midnight shifted by −24 h', () => {
    expect(net.patterns[0].trips.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(net.patterns[4].trips).toEqual([{ id: 'n1', serviceDate: '20261018', arr: [600, 900], dep: [600, 900] }]);
    expect(buildNetwork(stops, timetable, '20261018').patterns[0].trips).toEqual([]);
  });
  it('indexes patterns per stop', () => {
    expect(net.stopPatterns[2]).toEqual([{ p: 0, pos: 2 }, { p: 2, pos: 0 }, { p: 4, pos: 1 }]);
  });
});

describe('raptor', () => {
  it('finds a direct ride', () => {
    const js = raptor(net, at(0), at(2), H(7, 55));
    expect(js.length).toBe(1);
    expect(js[0]).toMatchObject({ rides: 1, arrive: H(8, 10), firstDepart: H(8, 0) });
  });
  it('keeps the Pareto set: slow direct and faster with a transfer; respects 60 s same-stop transfer', () => {
    const js = raptor(net, at(0), at(5), H(7, 55));
    expect(js.map((j) => [j.rides, j.arrive])).toEqual([[1, H(9, 0)], [2, H(8, 33)]]);
    const second = js[1].steps.filter((s) => s.kind === 'ride');
    expect(second.map((s) => net.patterns[s.p].trips[s.trip].id)).toEqual(['a1', 'c2']);
  });
  it('uses walking transfers between nearby stops', () => {
    const js = raptor(net, at(0), at(4), H(7, 55));
    expect(js.length).toBe(1);
    expect(js[0].arrive).toBe(H(8, 21));
    expect(js[0].steps.map((s) => s.kind)).toEqual(['ride', 'foot', 'ride']);
  });
  it('caps the number of rides', () => {
    const js = raptor(net, at(0), at(5), H(7, 55), 1);
    expect(js.map((j) => j.arrive)).toEqual([H(9, 0)]);
  });
  it('returns nothing after the last bus', () => {
    expect(raptor(net, at(0), at(5), H(9, 30))).toEqual([]);
  });
  it('rides previous-day trips after midnight', () => {
    const js = raptor(net, at(1), at(2), 0);
    expect(js[0].arrive).toBe(900);
  });
  it('adds access and egress durations', () => {
    const js = raptor(net, [{ stop: 0, sec: 120 }], [{ stop: 2, sec: 90 }], H(7, 58));
    expect(js[0].arrive).toBe(H(8, 10) + 90);
    expect(raptor(net, [{ stop: 0, sec: 180 }], [{ stop: 2, sec: 0 }], H(7, 58))[0].firstDepart).toBe(H(8, 30));
  });
});

describe('footpath relaxation', () => {
  it('never chains footpaths: relaxes only from ride labels of the round', () => {
    // X(0) -> B(2) arrives 1000; X -> A(1) arrives 500. A<->B 100 s, B<->C 100 s. Egress at C.
    const mk = (i: number, transfers: [number, number][]) => ({ id: 'T' + i, name: 'T' + i, platform: '', lat: 0, lon: 0, lines: [], transfers });
    const stopsX = [mk(0, []), mk(1, [[2, 100]]), mk(2, [[1, 100], [3, 100]]), mk(3, [[2, 100]])] as unknown as Network['stops'];
    const pat = (to: number, arr: number) => ({
      routeId: 'L1731' as const, directionId: 0, headsign: 'h', stops: [0, to], seq: [1, 2],
      trips: [{ id: 't' + to, serviceDate: '20261019', arr: [0, arr], dep: [0, arr] }],
    });
    // pattern order matters: B's ride is relaxed before A's
    const patterns = [pat(2, 1000), pat(1, 500)];
    const stopPatterns = stopsX.map(() => [] as { p: number; pos: number }[]);
    patterns.forEach((p, pi) => p.stops.forEach((s, pos) => stopPatterns[s].push({ p: pi, pos })));
    const net2: Network = { date: '20261019', stops: stopsX, patterns, stopPatterns };
    const js = raptor(net2, [{ stop: 0, sec: 0 }], [{ stop: 3, sec: 0 }], 0);
    expect(js.length).toBeGreaterThan(0);
    for (const j of js) {
      for (let i = 1; i < j.steps.length; i++) {
        expect(j.steps[i].kind === 'foot' && j.steps[i - 1].kind === 'foot').toBe(false);
      }
      let t = 0;
      for (const st of j.steps) {
        if (st.kind === 'ride') t = net2.patterns[st.p].trips[st.trip].arr[st.alightPos];
        else t += st.sec;
      }
      expect(t + j.egress.sec).toBe(j.arrive);
    }
  });
  it('keeps a later ride arrival at a stop already reached by footpath (footpaths are not closed)', () => {
    // O(0) -P0-> S(1) @100; S<->M(2) 50 s gives M a foot label @150, but M->D(3) cannot chain.
    // P1 S->M arrives @400 (round 2); the footpath M->D (50 s) must still be relaxed: arrive 450.
    const mk = (i: number, transfers: [number, number][]) => ({ id: 'T' + i, name: 'T' + i, platform: '', lat: 0, lon: 0, lines: [], transfers });
    const stopsX = [mk(0, []), mk(1, [[2, 50]]), mk(2, [[1, 50], [3, 50]]), mk(3, [[2, 50]])] as unknown as Network['stops'];
    const pat = (a: number, b: number, dep: number, arr: number) => ({
      routeId: 'L1731' as const, directionId: 0, headsign: 'h', stops: [a, b], seq: [1, 2],
      trips: [{ id: `t${a}${b}`, serviceDate: '20261019', arr: [dep, arr], dep: [dep, arr] }],
    });
    const patterns = [pat(0, 1, 0, 100), pat(1, 2, 200, 400)];
    const stopPatterns = stopsX.map(() => [] as { p: number; pos: number }[]);
    patterns.forEach((p, pi) => p.stops.forEach((s, pos) => stopPatterns[s].push({ p: pi, pos })));
    const net2: Network = { date: '20261019', stops: stopsX, patterns, stopPatterns };
    const js = raptor(net2, [{ stop: 0, sec: 0 }], [{ stop: 3, sec: 0 }], 0);
    expect(Math.min(...js.map((j) => j.arrive))).toBe(450);
  });
});
