import { describe, it, expect } from 'vitest';
import { linesRunningOn } from '../src/router/timetable';
import { timetable } from './fixtures/net';

describe('linesRunningOn', () => {
  it('lists the lines with a trip on that service day', () => {
    // fixture: weekday service W runs L1731/L1732/L1733/L1737; service N (the 18th) only the night L1736 trip
    expect([...linesRunningOn(timetable, '20261019')].sort()).toEqual(['L1731', 'L1732', 'L1733', 'L1737']);
    expect([...linesRunningOn(timetable, '20261018')]).toEqual(['L1736']);
    expect(linesRunningOn(timetable, '20261101').size).toBe(0);
  });
});
