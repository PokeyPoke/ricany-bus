import { describe, it, expect } from 'vitest';
import { leaveAt, secondsUntil } from '../src/lib/leave';
import type { Itinerary } from '../src/router/types';
import { H } from './fixtures/net';

const p = { lat: 50, lon: 14.6, name: 'x' };
const walk = (a: number, b: number) => ({ kind: 'walk' as const, from: p, to: p, depart: a, arrive: b, meters: 100 });
const bus = (a: number, b: number) => ({ kind: 'bus' as const, routeId: 'L1731' as const, headsign: 'h', tripId: 't', serviceDate: '20261019', pattern: 0,
  boardPos: 0, alightPos: 1, boardSeq: 1, alightSeq: 2, from: 0, to: 1, depart: a, arrive: b, stopCount: 1 });
const trip = (legs: Itinerary['legs']): Itinerary => ({ date: '20261019', depart: legs[0].depart, arrive: legs[legs.length - 1].arrive, rides: 1, free: true, legs });

describe('leaveAt', () => {
  it('is the bus departure minus the walk before it, shifted by the live delay', () => {
    const it0 = trip([walk(H(7, 52), H(7, 58)), bus(H(8, 0), H(8, 10)), walk(H(8, 10), H(8, 12))]);
    expect(leaveAt(it0, [null, null, null])).toBe(H(7, 54));
    expect(leaveAt(it0, [null, 180, null])).toBe(H(7, 57));
  });
  it('is null without a bus to catch', () => {
    expect(leaveAt(trip([walk(H(9, 0), H(9, 20))]), [null])).toBeNull();
  });
  it('counts across midnight', () => {
    expect(secondsUntil(trip([walk(H(0, 5), H(0, 9))]), H(0, 5), '20261018', H(23, 55))).toBe(600);
  });
});
