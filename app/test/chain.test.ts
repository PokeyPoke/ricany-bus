import { describe, it, expect } from 'vitest';
import { legChain } from '../src/lib/chain';
import type { Leg } from '../src/router/types';

const p = { lat: 50, lon: 14.6, name: 'x' };
const walk = (a: number, b: number): Leg => ({ kind: 'walk', from: p, to: p, depart: a, arrive: b, meters: 100 });
const bus = (a: number, b: number): Leg => ({ kind: 'bus', routeId: 'L1737', headsign: 'h', tripId: 't', serviceDate: '20261019', pattern: 0,
  boardPos: 0, alightPos: 1, boardSeq: 1, alightSeq: 2, from: 0, to: 1, depart: a, arrive: b, stopCount: 1 });

describe('legChain', () => {
  it('merges back-to-back walks into one', () => {
    expect(legChain([walk(0, 1020), bus(1020, 1680), walk(1680, 1980), walk(1980, 3120)]))
      .toEqual([{ kind: 'walk', min: 17 }, { kind: 'bus', routeId: 'L1737' }, { kind: 'walk', min: 24 }]);
  });
  it('keeps walks around a bike leg separate and rounds to at least 1 min', () => {
    const bike: Leg = { kind: 'bike', from: { uid: 1, name: 'a', lat: 0, lon: 0, bikes: 1, freeRacks: 1 }, to: { uid: 2, name: 'b', lat: 0, lon: 0, bikes: 1, freeRacks: 1 }, depart: 60, arrive: 660, meters: 2000 };
    expect(legChain([walk(0, 20), bike, walk(660, 700)])).toEqual([{ kind: 'walk', min: 1 }, { kind: 'bike', min: 10 }, { kind: 'walk', min: 1 }]);
  });
  it('leaves out a walk of a few metres to the stop', () => {
    const tiny: Leg = { ...walk(0, 10), meters: 7 } as Leg;
    expect(legChain([tiny, bus(60, 600)])).toEqual([{ kind: 'bus', routeId: 'L1737' }]);
  });
});
