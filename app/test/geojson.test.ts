import { describe, it, expect } from 'vitest';
import type { LineRec } from '@rb/shared';
import { linesGeoJson, groupsGeoJson, lineStopsGeoJson, bikesGeoJson, busesGeoJson, tripGeoJson, bbox } from '../src/map/geojson';
import type { AppData } from '../src/lib/data';
import type { Itinerary } from '../src/router/types';
import { stops, timetable, H } from './fixtures/net';

const line: LineRec = { routeId: 'L1731', number: '1', color: '#E4002B', text: '#FFFFFF', longName: 'x', directions: [{ directionId: 0, headsign: 'S2', stops: [0, 1, 2], shape: [[14.65, 49.99], [14.65, 50.018]] }] };
const data: AppData = { stops, groups: [], lines: [line], timetable, meta: { feedStart: '', feedEnd: '', generatedAt: '', tripCount: 0 } };

describe('geojson', () => {
  const groups = [
    { id: 'A', name: 'Alpha', lat: 50, lon: 14, platforms: [0, 1], lines: ['L1731', 'L1733'] as never },
    { id: 'B', name: 'Beta', lat: 50.1, lon: 14.1, platforms: [2], lines: ['L1731'] as never },
  ];
  const st = [{ group: 0 }, { group: 0 }, { group: 1 }] as never;
  it('groups and numbered line stops', () => {
    const g = groupsGeoJson(groups);
    expect(g.features[1].properties).toEqual({ gi: 1, id: 'B', name: 'Beta', ring: 'ring-L1731' });
    expect(g.features[0].properties.ring).toBe('ring-L1731-L1733');
    const l = { ...line, directions: [{ directionId: 0, headsign: 'x', stops: [0, 1, 2, 0], shape: [] }] };
    const f = lineStopsGeoJson(groups, st, l, 0).features;
    expect(f.map((x) => x.properties.n)).toEqual([1, 2]);
    expect(f[0].properties).toEqual({ gi: 0, n: 1, color: '#E4002B', text: '#FFFFFF', stopIdx: 0, number: '1', directionId: 0 });
    expect(lineStopsGeoJson(groups, st, l, 5).features).toEqual([]);
  });
  it('lines, stops and bikes', () => {
    expect(linesGeoJson([line]).features[0]).toEqual({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[14.65, 49.99], [14.65, 50.018]] }, properties: { routeId: 'L1731', number: '1', color: '#E4002B', directionId: 0 } });
    expect(bikesGeoJson([{ uid: 9, name: 'B', lat: 1, lon: 2, bikes: 3, freeRacks: 1 }]).features[0]).toEqual({ type: 'Feature', geometry: { type: 'Point', coordinates: [2, 1] }, properties: { uid: 9, name: 'B', bikes: 3 } });
  });
  it('trip overlay draws buses through their stops and walks as straight lines', () => {
    const it0: Itinerary = { date: '20261019', depart: H(8, 0), arrive: H(8, 12), rides: 1, free: true, legs: [
      { kind: 'bus', routeId: 'L1731', headsign: 'S2', tripId: 'a1', serviceDate: '20261019', pattern: 0, boardPos: 0, alightPos: 2, boardSeq: 1, alightSeq: 3, from: 0, to: 2, depart: H(8, 0), arrive: H(8, 10), stopCount: 2 },
      { kind: 'walk', from: { lat: 50.018, lon: 14.65, name: 'S2' }, to: { lat: 50.019, lon: 14.651, name: 'x' }, depart: H(8, 10), arrive: H(8, 12), meters: 130 },
    ] };
    const fc = tripGeoJson(it0, data);
    expect(fc.features.map((f) => f.properties.kind)).toEqual(['bus', 'walk']);
    expect(fc.features[0].geometry.coordinates).toEqual([[14.65, 49.99], [14.65, 50.004], [14.65, 50.018]]);
    expect(fc.features[0].properties.color).toBe('#E4002B');
  });
  it('bbox', () => {
    expect(bbox([[1, 2], [3, 0], [2, 5]])).toEqual([[1, 0], [3, 5]]);
    expect(bbox([])).toBeNull();
  });
});

describe('busesGeoJson', () => {
  it('maps vehicles to points with line style and bearing', () => {
    const v = (o: object) => ({ id: 'v', label: '1', tripId: 'T1', routeId: 'L1731', startDate: '20261016', lat: 49.99, lon: 14.66, bearing: 90, speed: 5, stopSeq: 2, ts: 1, ...o }) as never;
    const fc = busesGeoJson([v({}), v({ tripId: 'T2', bearing: null })]);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [14.66, 49.99] });
    expect(fc.features[0].properties).toMatchObject({ tripId: 'T1', routeId: 'L1731', number: '1', bearing: 90 });
    expect(typeof fc.features[0].properties.color).toBe('string');
    expect(typeof fc.features[0].properties.text).toBe('string');
    expect(fc.features[1].properties.bearing).toBe(-1);
  });
  it('carries displacement and a pre-rotated arrow offset', () => {
    const v = { id: 'v', label: '1', tripId: 'T1', routeId: 'L1731', startDate: '20261016', lat: 49.99, lon: 14.66, bearing: 90, speed: 5, stopSeq: 2, ts: 1 } as never;
    const f = busesGeoJson([v], { T1: [0, -40] }).features[0].properties;
    expect(f.off).toEqual([0, -40]);
    expect(f.disp).toBe(40);
    // rotating aoff clockwise by the bearing must give displacement + orbit along east
    const [x, y] = f.aoff as number[];
    const a = Math.PI / 2;
    expect(x * Math.cos(a) - y * Math.sin(a)).toBeCloseTo(34);
    expect(x * Math.sin(a) + y * Math.cos(a)).toBeCloseTo(-40);
  });
});
