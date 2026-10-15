import { describe, it, expect } from 'vitest';
import type { DelaysResponse } from '@rb/shared';
import { delayAt, tripDelay, overlayDelays } from '../src/router/delays';
import type { Itinerary } from '../src/router/types';
import { H } from './fixtures/net';

const resp = (trips: DelaysResponse['trips']): DelaysResponse => ({ generatedAt: 1, trips });

describe('tripDelay', () => {
  const d = resp({ a1: { startDate: '20261019', delay: 30, stops: { 1: 60, 3: 120 } } });
  it('uses the exact stop sequence, else the nearest earlier one, else the trip delay', () => {
    expect(tripDelay(d, 'a1', '20261019', 3)).toBe(120);
    expect(tripDelay(d, 'a1', '20261019', 2)).toBe(60);
    expect(delayAt({ startDate: '', delay: 30, stops: { 5: 10 } }, 2)).toBe(30);
  });
  it('ignores delays from a different start date', () => {
    expect(tripDelay(d, 'a1', '20261018', 3)).toBeNull();
  });
  it('returns null without data', () => {
    expect(tripDelay(null, 'a1', '20261019', 1)).toBeNull();
    expect(tripDelay(d, 'zz', '20261019', 1)).toBeNull();
  });
});

describe('overlayDelays', () => {
  const it0: Itinerary = {
    date: '20261019', depart: H(8, 0), arrive: H(8, 21), rides: 2, free: true,
    legs: [
      { kind: 'bus', routeId: 'L1731', headsign: 'S2', tripId: 'a1', serviceDate: '20261019', pattern: 0, boardPos: 0, alightPos: 2, boardSeq: 1, alightSeq: 3, from: 0, to: 2, depart: H(8, 0), arrive: H(8, 10), stopCount: 2 },
      { kind: 'walk', from: { lat: 0, lon: 0, name: 'S2' }, to: { lat: 0, lon: 0, name: 'S3' }, depart: H(8, 10), arrive: H(8, 10) + 174, meters: 167 },
      { kind: 'bus', routeId: 'L1733', headsign: 'S4', tripId: 'b1', serviceDate: '20261019', pattern: 1, boardPos: 0, alightPos: 1, boardSeq: 1, alightSeq: 2, from: 3, to: 4, depart: H(8, 15), arrive: H(8, 21), stopCount: 1 },
    ],
  };
  it('flags a transfer at risk when the incoming bus is late', () => {
    const o = overlayDelays(it0, resp({ a1: { startDate: '20261019', delay: 150, stops: { 3: 150 } } }));
    expect(o.alightDelay[0]).toBe(150);
    expect(o.boardDelay[2]).toBeNull();
    expect(o.transferRisk).toEqual([false, false, true]);
  });
  it('no risk when on time or when there is no live data', () => {
    expect(overlayDelays(it0, resp({ a1: { startDate: '20261019', delay: 0, stops: {} } })).transferRisk).toEqual([false, false, false]);
    expect(overlayDelays(it0, null).transferRisk).toEqual([false, false, false]);
  });
});
