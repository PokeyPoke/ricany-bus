import { describe, it, expect } from 'vitest';
import { buildNetwork } from '../src/router/network';
import { departuresAt } from '../src/router/departures';
import { stopTimetable, sampleDate, dayTypeOf } from '../src/router/timetable';
import { stops, timetable, H } from './fixtures/net';

const net = buildNetwork(stops, timetable, '20261019');

describe('departuresAt', () => {
  it('lists upcoming departures, excluding trips that end at this stop', () => {
    const d = departuresAt(net, 2, H(8, 0), 5);
    expect(d.map((x) => [x.tripId, x.dep, x.routeId])).toEqual([['c1', H(8, 10, 30), 'L1732'], ['c2', H(8, 25), 'L1732']]);
    expect(d[0]).toMatchObject({ seq: 1, headsign: 'S5', serviceDate: '20261019' });
  });
  it('respects the limit and the start time', () => {
    expect(departuresAt(net, 0, H(8, 0), 2).map((x) => x.dep)).toEqual([H(8, 0), H(8, 0)]);
    expect(departuresAt(net, 0, H(8, 1), 5).map((x) => x.tripId)).toEqual(['a2']);
  });
});

describe('timetable', () => {
  it('stopTimetable groups departures by hour', () => {
    expect([...stopTimetable(timetable, 'L1731', 0, 0, '20261019')]).toEqual([[8, [0, 30]]]);
    expect([...stopTimetable(timetable, 'L1731', 0, 0, '20261018')]).toEqual([]);
  });
  it('sampleDate picks the first matching day type in the data window', () => {
    expect(sampleDate(timetable, 'weekday', '20261018')).toBe('20261019');
    expect(sampleDate(timetable, 'sunday', '20261001')).toBe('20261018');
    expect(sampleDate(timetable, 'saturday', '20261001')).toBeNull();
  });
  it('dayTypeOf', () => {
    expect(dayTypeOf('20261019')).toBe('weekday');
    expect(dayTypeOf('20261017')).toBe('saturday');
    expect(dayTypeOf('20261018')).toBe('sunday');
  });
});
