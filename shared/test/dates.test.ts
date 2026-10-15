import { describe, it, expect } from 'vitest';
import { addDays, weekday, daysBetween } from '../src/index';

describe('dates', () => {
  it('addDays crosses month ends', () => {
    expect(addDays('20261031', 1)).toBe('20261101');
    expect(addDays('20261101', -1)).toBe('20261031');
  });
  it('weekday is 0=Monday', () => {
    expect(weekday('20261019')).toBe(0);
    expect(weekday('20261018')).toBe(6);
  });
  it('daysBetween', () => {
    expect(daysBetween('20261015', '20261028')).toBe(13);
    expect(daysBetween('20261028', '20261015')).toBe(-13);
  });
});
