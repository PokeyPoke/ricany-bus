import { describe, it, expect } from 'vitest';
import type { LineRec } from '@rb/shared';
import { parallelRuns } from '../src/map/parallel';

const line = (routeId: string, shapes: [number, number][][]): LineRec =>
  ({ routeId, number: routeId, color: '#000', text: '#fff', longName: '', directions: shapes.map((shape, i) => ({ directionId: i, headsign: '', stops: [], shape })) }) as never;

// lines 1 and 3 share an east–west road from 14.600 to 14.610; line 3 then turns north on its own
const shared: [number, number][] = [[14.6, 50], [14.61, 50]];
const l1 = line('L1731', [shared, [...shared].reverse()]);
const l3 = line('L1733', [[...shared, [14.61, 50.01]]]);

describe('parallelRuns', () => {
  const runs = parallelRuns([l1, l3]);
  it('puts lines sharing a road side by side, in line order', () => {
    const r1 = runs.filter((r) => r.routeId === 'L1731' && r.dir === 0);
    const r3 = runs.find((r) => r.routeId === 'L1733' && r.coords[0][0] === 14.6)!;
    expect(r1.every((r) => r.off === -0.5)).toBe(true);
    expect(r3.off).toBe(0.5);
  });
  it('keeps both directions of a line on the same side of the road', () => {
    const back = runs.filter((r) => r.routeId === 'L1731' && r.dir === 1);
    // travelling west, the offset sign flips so the drawn side matches dir 0
    expect(back.every((r) => r.off === 0.5)).toBe(true);
  });
  it('centres a line where it runs alone', () => {
    const north = runs.find((r) => r.routeId === 'L1733' && r.coords[r.coords.length - 1][1] === 50.01)!;
    expect(north.off).toBe(0);
    // the runs cover the whole route without gaps
    const all = runs.filter((r) => r.routeId === 'L1733');
    for (let i = 1; i < all.length; i++) expect(all[i].coords[0]).toEqual(all[i - 1].coords[all[i - 1].coords.length - 1]);
  });
});
