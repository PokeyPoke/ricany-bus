import { describe, it, expect } from 'vitest';
import { better } from '../src/lib/geoloc';

const at = (acc: number, t = 0) => ({ lat: 50, lon: 14.6, acc, at: t });

describe('location refinement', () => {
  it('a GPS fix replaces the coarse first answer, not the other way round', () => {
    expect(better(at(20, 1000), at(3000))).toBe(true);
    expect(better(at(3000, 1000), at(20))).toBe(false);
  });
  it('a fix of similar quality or any precise fix updates the dot (walking)', () => {
    expect(better(at(40, 1000), at(35))).toBe(true);
    expect(better(at(45, 1000), at(10))).toBe(true);
  });
  it('an old dot gives way after a minute even to a rougher fix', () => {
    expect(better(at(800, 70_000), at(20, 0))).toBe(true);
  });
});
