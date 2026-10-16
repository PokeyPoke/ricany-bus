import { describe, it, expect } from 'vitest';
import { ringKey, ringSegments } from '../src/map/rings';

describe('rings', () => {
  it('key', () => expect(ringKey(['L1731', 'L1733'])).toBe('ring-L1731-L1733'));
  it('single line is a full circle', () => {
    const s = ringSegments(['L1731']);
    expect(s).toEqual([{ color: '#E4002B', start: -Math.PI / 2, end: (3 * Math.PI) / 2 }]);
  });
  it('two lines: equal arcs with gaps, ordered colours', () => {
    const s = ringSegments(['L1731', 'L1733']);
    expect(s.map((x) => x.color)).toEqual(['#E4002B', '#00965E']);
    expect(s[0].end - s[0].start).toBeCloseTo(s[1].end - s[1].start);
    expect(s[1].start - s[0].end).toBeCloseTo(0.08);
    expect(s[0].start).toBeGreaterThan(-Math.PI / 2);
  });
  it('no lines', () => expect(ringSegments([])).toEqual([]));
});
