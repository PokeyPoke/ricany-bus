import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { raptor } from '../src/router/raptor';
import { stops, timetable, H } from './fixtures/net';

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
