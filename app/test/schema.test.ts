import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AppData } from '../src/lib/data';
import { directionPath } from '../src/v3/schema';

const load = <T>(n: string): T => JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), 'utf8'));
const data = {
  stops: load<{ stops: AppData['stops'] }>('stops').stops,
  groups: load<{ groups: AppData['groups'] }>('groups').groups,
  lines: load<{ lines: AppData['lines'] }>('lines').lines,
} as unknown as AppData;

describe('line diagram', () => {
  it('draws each line along its own drawn line, through all its stops', () => {
    for (const line of data.lines) {
      line.directions.forEach((_, d) => {
        const p = directionPath(data, line, d)!;
        // traced: many more points than stops (a straight polyline would have one per stop)
        expect(p.pts.length, `${line.number}/${d}`).toBeGreaterThan(p.stops.length);
        expect(p.stops.length).toBeGreaterThan(2);
        // starts and ends at its terminus
        expect(Math.hypot(p.pts[0][0] - p.stops[0][0], p.pts[0][1] - p.stops[0][1])).toBeLessThan(1);
        const a = p.pts[p.pts.length - 1], b = p.stops[p.stops.length - 1];
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1);
      });
    }
  });
});
