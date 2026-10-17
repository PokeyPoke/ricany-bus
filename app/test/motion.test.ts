import { describe, it, expect } from 'vitest';
import { haversine, type Vehicle } from '@rb/shared';
import { BusMotion, alongShape } from '../src/map/motion';

// an L-shaped line: east 0.004° (~286 m), then north 0.004° (~445 m)
const SHAPE: [number, number][] = [[14.65, 50], [14.654, 50], [14.654, 50.004]];
const bus = (lon: number, lat: number, ts: number, tripId = 't1'): Vehicle =>
  ({ id: tripId, label: '', tripId, routeId: 'L1731', startDate: '20261019', lat, lon, bearing: null, speed: null, stopSeq: null, ts });

describe('alongShape', () => {
  it('follows the shape round the corner instead of cutting it', () => {
    const p = alongShape([SHAPE], [14.652, 50], [14.654, 50.002])!;
    expect(p).toContainEqual([14.654, 50]);
  });
  it('rejects backwards movement and points far off the shape', () => {
    expect(alongShape([SHAPE], [14.654, 50.002], [14.652, 50])).toBeNull();
    expect(alongShape([SHAPE], [14.652, 50.003], [14.654, 50.002])).toBeNull();
  });
  it('picks the direction that runs forward', () => {
    const back = [...SHAPE].reverse();
    expect(alongShape([back, SHAPE], [14.652, 50], [14.654, 50.002])).toContainEqual([14.654, 50]);
  });
});

describe('BusMotion', () => {
  const m = () => new BusMotion(() => [SHAPE]);

  it('shows a new bus where it is reported, without moving', () => {
    const mo = m();
    mo.update([bus(14.652, 50, 1000)], 0);
    expect(mo.at(0)[0]).toMatchObject({ lon: 14.652, lat: 50 });
    expect(mo.moving(0)).toBe(false);
  });

  it('glides along the shape over the gap between reports', () => {
    const mo = m();
    mo.update([bus(14.652, 50, 1000)], 0);
    mo.update([bus(14.654, 50.002, 1010)], 100_000); // reports 10 s apart
    expect(mo.moving(100_000)).toBe(true);
    expect(mo.at(100_000)[0]).toMatchObject({ lon: 14.652, lat: 50 });
    const early = mo.at(102_000)[0]; // 73 of 365 m along: still on the eastbound leg
    expect(early.lat).toBeCloseTo(50, 6);
    expect(early.lon).toBeGreaterThan(14.652);
    expect(early.lon).toBeLessThan(14.654);
    const late = mo.at(108_000)[0]; // 292 m along: round the corner, heading north
    expect(late.lon).toBeCloseTo(14.654, 6);
    expect(late.lat).toBeGreaterThan(50);
    expect(mo.at(110_000)[0]).toMatchObject({ lon: 14.654, lat: 50.002 });
    expect(mo.moving(110_000)).toBe(false);
  });

  it('continues from where it is drawn when a report arrives mid-glide', () => {
    const mo = m();
    mo.update([bus(14.65, 50, 1000)], 0);
    mo.update([bus(14.654, 50, 1010)], 0);
    const mid = mo.at(5000)[0];
    mo.update([bus(14.654, 50.004, 1020)], 5000);
    expect(mo.at(5000)[0].lon).toBeCloseTo(mid.lon, 9);
  });

  it('keeps the glide when the same report is polled again', () => {
    const mo = m();
    mo.update([bus(14.652, 50, 1000)], 0);
    mo.update([bus(14.654, 50.002, 1010)], 0);
    mo.update([bus(14.654, 50.002, 1010)], 4000);
    expect(mo.moving(4000)).toBe(true);
  });

  it('jumps without animating when asked, or over long distances, and forgets buses that vanish', () => {
    const mo = m();
    mo.update([bus(14.652, 50, 1000), bus(14.65, 50, 1000, 't2')], 0);
    mo.update([bus(14.654, 50.002, 1010)], 0, false);
    expect(mo.moving(0)).toBe(false);
    expect(mo.at(0).map((v) => v.tripId)).toEqual(['t1']);
    mo.update([bus(14.7, 50.05, 1020)], 0);
    expect(mo.moving(0)).toBe(false);
    expect(haversine(50.002, 14.654, 50.05, 14.7)).toBeGreaterThan(1500);
  });

  it('clamps the glide to 2–15 s', () => {
    const mo = m();
    mo.update([bus(14.652, 50, 1000)], 0);
    mo.update([bus(14.653, 50, 1120)], 0); // two minutes between reports
    expect(mo.moving(14_000)).toBe(true);
    expect(mo.moving(15_001)).toBe(false);
  });
});
