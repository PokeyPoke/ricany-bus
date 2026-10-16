import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { directRides, downstreamStops } from '../src/router/directRides';
import { stops, timetable, H } from './fixtures/net';
const netFor = (d: string) => buildNetwork(stops, timetable, d);

describe('directRides', () => {
  it('lists departures of the line from A that reach B, in time order', () => {
    const r = directRides(netFor, '20261019', H(7, 55), 'L1731', 0, [0], [2]);
    expect(r.map((x) => [x.tripId, x.dep, x.arr])).toEqual([['a1', H(8, 0), H(8, 10)], ['a2', H(8, 30), H(8, 40)]]);
  });
  it('rolls to the next service day', () => {
    const r = directRides(netFor, '20261019', H(9, 0), 'L1731', 0, [0], [2], 1);
    expect(r[0]).toMatchObject({ tripId: 'a1', date: '20261020', dep: H(8, 0) });
  });
  it('ignores stops in the wrong order', () => {
    expect(directRides(netFor, '20261019', 0, 'L1731', 0, [2], [0])).toEqual([]);
  });
});

describe('downstreamStops', () => {
  it('lists later stops with typical minutes from the first trip', () => {
    const d = downstreamStops(timetable, stops, 'L1731', 0, [0, 1, 2], [0]);
    expect(d.map((x) => [x.group, x.minutes])).toEqual([[1, 5], [2, 10]]);
  });
  it('downstreamStops on a branch pattern', () => {
    // a stop that only appears in one pattern still gets a time from that pattern; stops not reachable are skipped
    const d = downstreamStops(timetable, stops, 'L1731', 0, [0, 1, 2, 5], [1]);
    expect(d.map((x) => x.group)).toEqual([2]);
  });
});
