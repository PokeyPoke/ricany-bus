import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirSource } from '../src/source';
import { extractFree, parseTime } from '../src/extract';

const FIX = fileURLToPath(new URL('./fixture', import.meta.url));

describe('parseTime', () => {
  it('handles >24h GTFS times', () => {
    expect(parseTime('07:05:30')).toBe(25530);
    expect(parseTime('24:10:00')).toBe(87000);
  });
});

describe('extractFree', () => {
  it('keeps only free route_ids (not Benešov "MHD 1", not 364)', async () => {
    const raw = await extractFree(dirSource(FIX));
    expect([...raw.routes.keys()].sort()).toEqual(['L1731', 'L1733']);
    expect(raw.trips.map((t) => t.id).sort()).toEqual(['1731_1', '1731_2', '1731_3', '1733_1']);
  });
  it('keeps only stops served by free trips', async () => {
    const raw = await extractFree(dirSource(FIX));
    expect([...raw.stops.keys()].sort()).toEqual(['UA', 'UB', 'UC', 'UD', 'UE']);
    expect(raw.stops.get('UA')).toEqual({ name: 'Říčany,Alfa', platform: 'A', lat: 49.99, lon: 14.65 });
  });
  it('orders stop times and parses arr/dep', async () => {
    const raw = await extractFree(dirSource(FIX));
    const t = raw.trips.find((x) => x.id === '1731_1')!;
    expect(t.stopTimes.map((s) => s.stopId)).toEqual(['UA', 'UB', 'UC']);
    expect(t.stopTimes[1]).toEqual({ seq: 2, stopId: 'UB', arr: 25500, dep: 25530 });
  });
  it('keeps calendar rows and shapes only for free services, shapes sorted', async () => {
    const raw = await extractFree(dirSource(FIX));
    expect(raw.calendar.map((c) => c.service_id).sort()).toEqual(['S', 'W']);
    expect(raw.calendarDates.length).toBe(2);
    expect(raw.shapes.get('L1731V1')).toEqual([[14.65, 49.99], [14.655, 49.995], [14.66, 50]]);
    expect(raw.shapes.has('L1761V1')).toBe(false);
    expect(raw.feedInfo).toEqual({ start: '20261015', end: '20261028' });
  });
});
