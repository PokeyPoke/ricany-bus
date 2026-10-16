import { describe, it, expect } from 'vitest';
import { spreadOffsets } from '../src/map/spread';
import { darken, signFontPx } from '../src/map/busStyle';

const dist = (a: [number, number]) => Math.hypot(a[0], a[1]);

describe('spreadOffsets', () => {
  it('isolated markers get [0,0]', () => {
    expect(spreadOffsets([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }])).toEqual({ a: [0, 0], b: [0, 0] });
    expect(spreadOffsets([])).toEqual({});
  });
  it('two close points fan out symmetrically, at least minPx apart', () => {
    const o = spreadOffsets([{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 110, y: 100 }], 34);
    const pa: [number, number] = [100 + o.a[0], 100 + o.a[1]], pb: [number, number] = [110 + o.b[0], 100 + o.b[1]];
    expect(Math.hypot(pa[0] - pb[0], pa[1] - pb[1])).toBeGreaterThanOrEqual(34 - 1e-6);
    // symmetric around the centroid (105,100), 12 o'clock first
    expect((pa[0] + pb[0]) / 2).toBeCloseTo(105); expect((pa[1] + pb[1]) / 2).toBeCloseTo(100);
    expect(pa[0]).toBeCloseTo(105); expect(pa[1]).toBeLessThan(100);
  });
  it('three coincident points sit 120 degrees apart on radius >= minPx/(2 sin(pi/3))', () => {
    const o = spreadOffsets([{ id: 'c', x: 50, y: 50 }, { id: 'a', x: 50, y: 50 }, { id: 'b', x: 50, y: 50 }], 34);
    const r = 34 / (2 * Math.sin(Math.PI / 3));
    for (const k of ['a', 'b', 'c']) expect(dist(o[k])).toBeGreaterThanOrEqual(r - 1e-6);
    expect(o.a[0]).toBeCloseTo(0); expect(o.a[1]).toBeLessThan(0); // a first, 12 o'clock
    const ang = (k: string) => Math.atan2(o[k][1], o[k][0]);
    const d = (Math.abs(ang('b') - ang('a')) * 180) / Math.PI;
    expect(Math.min(d, 360 - d)).toBeCloseTo(120);
  });
  it('honours a minimum radius so the true position stays outside the icons', () => {
    const o = spreadOffsets([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }], 34, 40);
    expect(dist(o.a)).toBeCloseTo(40); expect(dist(o.b)).toBeCloseTo(40);
  });
  it('is deterministic regardless of input order', () => {
    const pts = [{ id: 'b', x: 5, y: 5 }, { id: 'a', x: 0, y: 0 }, { id: 'c', x: 9, y: 2 }];
    expect(spreadOffsets(pts)).toEqual(spreadOffsets([...pts].reverse()));
  });
  it('clusters single-link: a chain of near neighbours is one cluster, a far one stays', () => {
    const o = spreadOffsets([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 30, y: 0 }, { id: 'c', x: 60, y: 0 }, { id: 'z', x: 500, y: 0 }], 34);
    expect(o.z).toEqual([0, 0]);
    expect(dist(o.a) + dist(o.b) + dist(o.c)).toBeGreaterThan(0);
  });
});

describe('bus style helpers', () => {
  it('darken scales channels', () => {
    expect(darken('#ffffff', 0.25)).toBe('#bfbfbf');
    expect(darken('#E4002B', 0)).toBe('#e4002b');
    expect(darken('#000000', 0.5)).toBe('#000000');
  });
  it('sign font shrinks for two digits', () => {
    expect(signFontPx('9')).toBeGreaterThan(signFontPx('91'));
  });
});
