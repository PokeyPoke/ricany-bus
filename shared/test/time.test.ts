import { describe, it, expect } from 'vitest';
import { pragueNow, pragueToUtc, formatHM, hmToSec, secToHM } from '../src/index';

describe('time', () => {
  it('pragueNow in summer time (UTC+2)', () => {
    expect(pragueNow(new Date('2026-10-15T12:00:00Z'))).toEqual({ date: '20261015', sec: 14 * 3600 });
  });
  it('pragueNow in winter time (UTC+1)', () => {
    expect(pragueNow(new Date('2026-12-01T23:30:00Z'))).toEqual({ date: '20261202', sec: 30 * 60 });
  });
  it('pragueToUtc inverts pragueNow', () => {
    expect(pragueToUtc('20261015', 7 * 3600 + 30 * 60).toISOString()).toBe('2026-10-15T05:30:00.000Z');
    expect(pragueToUtc('20261202', 1800).toISOString()).toBe('2026-12-01T23:30:00.000Z');
  });
  it('formatHM wraps past midnight', () => {
    expect(formatHM(8 * 3600 + 30 * 60)).toBe('8:30');
    expect(formatHM(86400 + 600)).toBe('0:10');
    expect(formatHM(9 * 3600 + 5 * 60 + 59)).toBe('9:05');
  });
  it('hmToSec / secToHM', () => {
    expect(hmToSec('08:05')).toBe(29100);
    expect(secToHM(29100)).toBe('08:05');
  });
});
