import { describe, it, expect } from 'vitest';
import type { LineRec } from '@rb/shared';
import { linesGeoJson, stopsGeoJson, bikesGeoJson, tripGeoJson, bbox } from '../src/map/geojson';
import type { AppData } from '../src/lib/data';
import type { Itinerary } from '../src/router/types';
import { stops, timetable, H } from './fixtures/net';

const line: LineRec = { routeId: 'L1731', number: '1', color: '#E4002B', text: '#FFFFFF', longName: 'x', directions: [{ directionId: 0, headsign: 'S2', stops: [0, 1, 2], shape: [[14.65, 49.99], [14.65, 50.018]] }] };
const data: AppData = { stops, groups: [], lines: [line], timetable, meta: { feedStart: '', feedEnd: '', generatedAt: '', tripCount: 0 } };

describe('geojson', () => {
  it('lines, stops and bikes', () => {
    expect(linesGeoJson([line]).features[0]).toEqual({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[14.65, 49.99], [14.65, 50.018]] }, properties: { routeId: 'L1731', number: '1', color: '#E4002B', directionId: 0 } });
    expect(stopsGeoJson(stops).features.length).toBe(6);
    expect(stopsGeoJson(stops).features[0].properties).toEqual({ id: 'S0', name: 'S0', platform: 'A' });
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
