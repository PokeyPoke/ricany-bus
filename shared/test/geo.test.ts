import { describe, it, expect } from 'vitest';
import { haversine, walkSec, bikeSec } from '../src/index';

describe('geo', () => {
  it('haversine ~ 556 m per 0.005° latitude', () => {
    expect(haversine(49.99, 14.65, 49.995, 14.65)).toBeGreaterThan(550);
    expect(haversine(49.99, 14.65, 49.995, 14.65)).toBeLessThan(560);
  });
  it('walkSec applies 1.3 detour at 4.5 km/h', () => {
    expect(walkSec(1000)).toBe(Math.round((1000 * 1.3) / (4.5 / 3.6))); // 1040
  });
  it('bikeSec applies 1.3 detour at 14 km/h', () => {
    expect(bikeSec(1000)).toBe(Math.round((1000 * 1.3) / (14 / 3.6))); // 334
  });
});
