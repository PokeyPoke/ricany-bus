import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirSource } from '../src/source';
import { extractFree } from '../src/extract';
import { buildData, type BuiltData } from '../src/build';
import { validate } from '../src/validate';

const FIX = fileURLToPath(new URL('./fixture', import.meta.url));
let data: BuiltData;
beforeAll(async () => { data = buildData(await extractFree(dirSource(FIX)), '20261015', 'x'); });
const ok = { requiredRoutes: ['L1731', 'L1733'], minTrips: 1, maxTrips: 10 };

describe('validate', () => {
  it('passes a healthy feed', () => {
    expect(validate(data, '20261015', ok)).toEqual([]);
  });
  it('fails when a free route is missing', () => {
    expect(validate(data, '20261015', { ...ok, requiredRoutes: ['L1731', 'L1732'] })).toContain('missing route L1732');
  });
  it('fails when the feed ends too soon', () => {
    expect(validate(data, '20261025', ok)).toContain('feed ends in 3 days (need ≥ 7)');
  });
  it('fails on implausible trip counts', () => {
    expect(validate(data, '20261015', { ...ok, minTrips: 150 })).toContain('trip count 4 outside 150–10');
  });
  it('fails on non-monotonic times', () => {
    const bad = structuredClone(data);
    bad.timetable.patterns[0].trips[0].arr[2] = 0;
    expect(validate(bad, '20261015', ok).some((e) => e.startsWith('non-monotonic times in trip'))).toBe(true);
  });
  it('fails when the calendar yields no service days (empty/broken calendar)', () => {
    const bad = structuredClone(data);
    bad.timetable.servicesByDate = {};
    expect(validate(bad, '20261015', ok).some((e) => e.startsWith('only 0 of the next 10 days have service (need ≥ 3)'))).toBe(true);
  });
  it('ignores active service ids that have no trips in the patterns', () => {
    const bad = structuredClone(data);
    for (const d of Object.keys(bad.timetable.servicesByDate)) bad.timetable.servicesByDate[d] = ['GHOST'];
    expect(validate(bad, '20261015', ok).some((e) => e.startsWith('only 0 of the next 10 days have service (need ≥ 3)'))).toBe(true);
  });
  it('fails on non-finite times', () => {
    const bad = structuredClone(data);
    bad.timetable.patterns[0].trips[0].dep[1] = NaN;
    expect(validate(bad, '20261015', ok).some((e) => e.startsWith('non-finite times in trip'))).toBe(true);
  });
});
