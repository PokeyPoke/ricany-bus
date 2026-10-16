import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { prefilter } from '../src/prefilter';
import { decodeTripUpdates, decodeVehiclePositions } from '../src/pb';
import { filterDelays, filterPositions } from '../src/filter';

const tu = new Uint8Array(readFileSync(new URL('./fixture/trip_updates.pb', import.meta.url)));
const vp = new Uint8Array(readFileSync(new URL('./fixture/vehicle_positions.pb', import.meta.url)));

describe('prefilter', () => {
  it('keeps the header and only entities containing L173 — same filtered output as a full decode', () => {
    const small = prefilter(tu);
    expect(small.length).toBeLessThan(tu.length);
    expect(filterDelays(decodeTripUpdates(small))).toEqual(filterDelays(decodeTripUpdates(tu)));
    expect(decodeTripUpdates(small).timestamp).toBe(decodeTripUpdates(tu).timestamp);
    expect(filterPositions(decodeVehiclePositions(prefilter(vp)))).toEqual(filterPositions(decodeVehiclePositions(vp)));
  });
  it('is fast on a large feed', () => {
    const big = new Uint8Array(tu.length * 10);
    for (let i = 0; i < 10; i++) big.set(tu, i * tu.length);
    const t = performance.now();
    prefilter(big);
    expect(performance.now() - t).toBeLessThan(50);
  });
  it('throws on truncated input', () => {
    expect(() => prefilter(tu.subarray(0, tu.length - 7))).toThrow();
  });
});
