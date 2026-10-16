import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeTripUpdates } from '../src/pb';
import { filterDelays } from '../src/filter';

// Tiny protobuf encoder for synthetic feeds
const varint = (n: bigint) => { const out: number[] = []; let v = BigInt.asUintN(64, n); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return out; };
const tag = (f: number, wt: number) => varint(BigInt(f * 8 + wt));
const vi = (f: number, n: number) => [...tag(f, 0), ...varint(BigInt(n))];
const str = (f: number, s: string) => { const b = [...new TextEncoder().encode(s)]; return [...tag(f, 2), ...varint(BigInt(b.length)), ...b]; };
const msg = (f: number, body: number[]) => [...tag(f, 2), ...varint(BigInt(body.length)), ...body];

const entity = (tripId: string, routeId: string, startDate: string, stus: number[][]) =>
  msg(2, [...str(1, 'e-' + tripId), ...msg(3, [
    ...msg(1, [...str(1, tripId), ...str(3, startDate), ...str(5, routeId)]),
    ...stus.flat(),
  ])]);
const stu = (seq: number, depDelay: number, stopId: string) => msg(2, [...vi(1, seq), ...msg(3, vi(1, depDelay)), ...str(4, stopId)]);

const synthetic = new Uint8Array([
  ...msg(1, [...str(1, '2.0'), ...vi(3, 1792068643)]),
  ...entity('1731_1_1', 'L1731', '20261015', [stu(1, -30, 'U1Z1'), stu(2, 90, 'U2Z1')]),
  ...entity('131_9_9', 'L131', '20261015', [stu(1, 10, 'U9Z9')]),
]);

describe('decodeTripUpdates', () => {
  it('decodes header timestamp, trip descriptor and negative delays', () => {
    const f = decodeTripUpdates(synthetic);
    expect(f.timestamp).toBe(1792068643);
    expect(f.updates.length).toBe(2);
    expect(f.updates[0].trip).toEqual({ tripId: '1731_1_1', routeId: 'L1731', startDate: '20261015' });
    expect(f.updates[0].stopTimeUpdates[0]).toEqual({ stopSequence: 1, stopId: 'U1Z1', arrivalDelay: null, departureDelay: -30 });
  });
  it('decodes the captured real feed', () => {
    const f = decodeTripUpdates(new Uint8Array(readFileSync(new URL('./fixture/trip_updates.pb', import.meta.url))));
    expect(f.timestamp).toBeGreaterThan(1.7e9);
    expect(f.updates.length).toBeGreaterThan(40);
    expect(f.updates.every((u) => typeof u.trip?.tripId === 'string')).toBe(true);
  });
});

describe('filterDelays', () => {
  it('keeps only free-line trips, keyed by trip id with per-sequence delays', () => {
    const d = filterDelays(decodeTripUpdates(synthetic));
    expect(d).toEqual({ generatedAt: 1792068643, trips: { '1731_1_1': { startDate: '20261015', delay: 90, stops: { 1: -30, 2: 90 } } } });
  });
  it('real feed: every kept trip is a free line', () => {
    const d = filterDelays(decodeTripUpdates(new Uint8Array(readFileSync(new URL('./fixture/trip_updates.pb', import.meta.url)))));
    const ids = Object.keys(d.trips);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => /^173[1-7]_/.test(id))).toBe(true);
    expect(JSON.stringify(d).length).toBeLessThan(50_000);
  });
});

describe('decoder bounds', () => {
  it('throws when a sub-message declares a length beyond its parent', () => {
    // entity (len 2) containing trip_update field declaring 50 bytes
    expect(() => decodeTripUpdates(new Uint8Array([0x12, 0x02, 0x1a, 0x32, 0x00, 0x00, 0x00, 0x00]))).toThrow();
  });
});
