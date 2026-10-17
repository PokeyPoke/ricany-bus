import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirSource } from '../src/source';
import { extractFree, type RawFree } from '../src/extract';
import { buildData, activeServices, groupStops, type BuiltData } from '../src/build';

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
  it('adds route variants that serve stops the main one misses, most frequent first', () => {
    const r = structuredClone(raw);
    const base = r.trips.find((t) => t.id === '1731_1')!;
    const st = (stopIds: string[], start: number) => stopIds.map((stopId, i) => ({ seq: i + 1, stopId, arr: start + i * 300, dep: start + i * 300 }));
    // a branch to UD (not on the main A–B–C pattern), run three times; and a short A–B working, a subset of the main one
    for (let k = 0; k < 3; k++) r.trips.push({ ...base, id: `br${k}`, headsign: 'Delta', shapeId: '', stopTimes: st(['UA', 'UB', 'UD'], 30000 + k * 3600) });
    r.trips.push({ ...base, id: 'short', headsign: 'Beta', shapeId: '', stopTimes: st(['UA', 'UB'], 40000) });
    const l1 = buildData(r, '20261015', 'now').lines.lines.find((l) => l.routeId === 'L1731')!;
    const d0 = l1.directions.filter((d) => d.directionId === 0);
    expect(d0.map((d) => d.headsign)).toEqual(['Delta', 'Gamma']);
    expect(l1.directions.map((d) => d.directionId)).toEqual([0, 0, 1]);
  });
  it('keeps known wheelchair boarding only', () => {
    const r = structuredClone(raw);
    r.stops.get('UA')!.wheelchair = 1;
    r.stops.get('UB')!.wheelchair = 2;
    const st = buildData(r, '20261015', 'now').stops.stops;
    const by = (id: string) => st.find((s) => s.id === id)!;
    expect(by('UA').access).toBe(1);
    expect(by('UB').access).toBe(2);
    expect('access' in by('UC')).toBe(false);
  });
  it('writes meta', () => {
    expect(data.meta).toEqual({ feedStart: '20261015', feedEnd: '20261028', generatedAt: '2026-10-15T04:30:00Z', tripCount: 4 });
  });
});

describe('groups', () => {
  it('one group per display name with mean position, sorted platforms, ordered lines', () => {
    const g = data.groups.groups;
    expect(g.map((x) => x.name).sort()).toEqual(['Alfa', 'Beta', 'Delta', 'Epsilon', 'Gamma']);
    const alfa = g.find((x) => x.name === 'Alfa')!;
    expect(alfa.id).toBe('UA');
    expect(alfa.platforms).toEqual([idx('UA')]);
    expect(alfa.lines).toEqual(['L1731']);
    data.stops.stops.forEach((s, i) => expect(g[s.group].platforms).toContain(i));
  });
  it('groupStops merges platforms by name', () => {
    const mk = (id: string, lat: number, lon: number, lines: ('L1731' | 'L1733')[]) =>
      ({ id, name: 'X', platform: id, lat, lon, lines, transfers: [] as [number, number][] });
    const { groups, groupOf } = groupStops([mk('B', 50.002, 14.002, ['L1733']), mk('A', 50.0, 14.0, ['L1731'])]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 'A', platforms: [1, 0], lines: ['L1731', 'L1733'], lat: 50.001, lon: 14.001 });
    expect(groupOf).toEqual([0, 0]);
  });
});
