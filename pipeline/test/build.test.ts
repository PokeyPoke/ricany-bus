import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirSource } from '../src/source';
import { extractFree, type RawFree } from '../src/extract';
import { buildData, activeServices, type BuiltData } from '../src/build';

const FIX = fileURLToPath(new URL('./fixture', import.meta.url));
let raw: RawFree;
let data: BuiltData;
beforeAll(async () => {
  raw = await extractFree(dirSource(FIX));
  data = buildData(raw, '20261015', '2026-10-15T04:30:00Z');
});
const idx = (id: string) => data.stops.stops.findIndex((s) => s.id === id);

describe('activeServices', () => {
  it('weekday, saturday, and calendar_dates exceptions', () => {
    expect([...activeServices(raw.calendar, raw.calendarDates, '20261019')]).toEqual(['W']);
    expect([...activeServices(raw.calendar, raw.calendarDates, '20261017')]).toEqual(['S']);
    expect([...activeServices(raw.calendar, raw.calendarDates, '20261028')]).toEqual(['S']);
    expect([...activeServices(raw.calendar, raw.calendarDates, '20261018')]).toEqual([]);
  });
});

describe('buildData', () => {
  it('strips the Říčany, prefix and lists serving lines', () => {
    const a = data.stops.stops[idx('UA')];
    expect(a.name).toBe('Alfa');
    expect(a.lines).toEqual(['L1731']);
    expect(data.stops.stops[idx('UD')].lines).toEqual(['L1733']);
  });
  it('precomputes footpaths ≤ 400 m both ways', () => {
    const c = data.stops.stops[idx('UC')];
    const toD = c.transfers.find(([to]) => to === idx('UD'));
    expect(toD).toBeDefined();
    expect(toD![1]).toBeGreaterThan(170);
    expect(toD![1]).toBeLessThan(210);
    expect(data.stops.stops[idx('UD')].transfers.some(([to]) => to === idx('UC'))).toBe(true);
    expect(data.stops.stops[idx('UA')].transfers).toEqual([]);
  });
  it('groups trips into patterns sorted by first departure', () => {
    const p = data.timetable.patterns.find((x) => x.routeId === 'L1731' && x.directionId === 0)!;
    expect(p.stops).toEqual([idx('UA'), idx('UB'), idx('UC')]);
    expect(p.seq).toEqual([1, 2, 3]);
    expect(p.headsign).toBe('Gamma');
    expect(p.trips.map((t) => t.id)).toEqual(['1731_1', '1731_3']);
    expect(p.trips[0]).toEqual({ id: '1731_1', service: 'W', arr: [25200, 25500, 25800], dep: [25200, 25530, 25800] });
    expect(data.timetable.patterns.length).toBe(3);
  });
  it('resolves services per date from yesterday to feed end', () => {
    const keys = Object.keys(data.timetable.servicesByDate).sort();
    expect(keys[0]).toBe('20261014');
    expect(keys[keys.length - 1]).toBe('20261028');
    expect(data.timetable.servicesByDate['20261028']).toEqual(['S']);
  });
  it('builds lines with style, directions, and shape fallback to stop coords', () => {
    const l1 = data.lines.lines.find((l) => l.routeId === 'L1731')!;
    expect(l1.number).toBe('1');
    expect(l1.color).toBe('#E4002B');
    expect(l1.directions.map((d) => d.directionId)).toEqual([0, 1]);
    expect(l1.directions[0].shape).toEqual([[14.65, 49.99], [14.655, 49.995], [14.66, 50]]);
    expect(l1.directions[1].shape).toEqual([[14.66, 50], [14.655, 49.995], [14.65, 49.99]]);
  });
  it('writes meta', () => {
    expect(data.meta).toEqual({ feedStart: '20261015', feedEnd: '20261028', generatedAt: '2026-10-15T04:30:00Z', tripCount: 4 });
  });
});
