import { describe, it, expect } from 'vitest';
import { BIKE_BACK, BIKE_FWD, StreetGraph, WALK, walkSec, type StopRec } from '@rb/shared';
import { buildStreets, streetTransfers, wayFlags } from '../src/streets';
import type { OsmData } from '../src/osm';

describe('wayFlags', () => {
  it('classifies walking and cycling', () => {
    expect(wayFlags({ highway: 'residential' })).toBe(WALK | BIKE_FWD | BIKE_BACK);
    expect(wayFlags({ highway: 'footway' })).toBe(WALK);
    expect(wayFlags({ highway: 'footway', bicycle: 'yes' })).toBe(WALK | BIKE_FWD | BIKE_BACK);
    expect(wayFlags({ highway: 'steps', bicycle: 'yes' })).toBe(WALK);
    expect(wayFlags({ highway: 'cycleway', foot: 'no' })).toBe(BIKE_FWD | BIKE_BACK);
    expect(wayFlags({ highway: 'motorway' })).toBe(0);
    expect(wayFlags({ highway: 'trunk', foot: 'yes' })).toBe(WALK);
    expect(wayFlags({ highway: 'service', access: 'private' })).toBe(0);
    expect(wayFlags({ highway: 'pedestrian', area: 'yes' })).toBe(0);
    expect(wayFlags({ highway: 'primary', bicycle: 'use_sidepath' })).toBe(WALK);
  });
  it('applies one-way rules to bikes only', () => {
    expect(wayFlags({ highway: 'residential', oneway: 'yes' })).toBe(WALK | BIKE_FWD);
    expect(wayFlags({ highway: 'residential', oneway: '-1' })).toBe(WALK | BIKE_BACK);
    expect(wayFlags({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no' })).toBe(WALK | BIKE_FWD | BIKE_BACK);
    expect(wayFlags({ highway: 'residential', oneway: 'yes', cycleway: 'opposite_lane' })).toBe(WALK | BIKE_FWD | BIKE_BACK);
    expect(wayFlags({ highway: 'tertiary', junction: 'roundabout' })).toBe(WALK | BIKE_FWD);
  });
});

function osm(): OsmData {
  // a T: 1–2–3 west→east, 2–4 north, plus an unconnected island 8–9 and a building way
  const nodes = new Map<number, [number, number]>([
    [1, [50, 14.6]], [2, [50, 14.602]], [3, [50, 14.604]], [4, [50.002, 14.602]], [5, [50.0001, 14.601]],
    [8, [50.01, 14.6]], [9, [50.01, 14.601]],
  ]);
  return {
    nodes,
    ways: [
      { id: 10, nodes: [1, 5, 2, 3], tags: { highway: 'residential' } },
      { id: 11, nodes: [2, 4], tags: { highway: 'footway' } },
      { id: 12, nodes: [8, 9], tags: { highway: 'residential' } },
      { id: 13, nodes: [3, 404], tags: { highway: 'service' } }, // node 404 missing from the download
    ],
  };
}

describe('buildStreets', () => {
  it('splits ways at junctions, keeps the main component and stores bends as deltas', () => {
    const f = buildStreets(osm(), 'now', 0);
    const g = new StreetGraph(f);
    expect(g.nodeCount).toBe(4); // 1, 2, 3, 4 — node 5 is a bend, the island is dropped
    expect(g.edgeCount).toBe(3);
    const e12 = [0, 1, 2].find((e) => f.geom[e].length === 2)!;
    expect(f.geom[e12]).toEqual([10, 100]); // node 5 is 0.0001° north, 0.001° east of node 1
    expect(f.edges[3 * e12 + 2]).toBe(WALK | BIKE_FWD | BIKE_BACK);
  });
  it('drops bends within the simplification tolerance', () => {
    expect(buildStreets(osm(), 'now', 20).geom.every((g) => g.length === 0)).toBe(true);
  });
});

describe('streetTransfers', () => {
  const stop = (lat: number, lon: number, transfers: [number, number][]): StopRec =>
    ({ id: '', name: '', platform: '', lat, lon, lines: [], transfers, group: 0 });
  it('uses street meters, but keeps straight-line time for platforms across the road', () => {
    const g = new StreetGraph(buildStreets(osm(), 'now', 0));
    // a on the main street at the west end, b on the footway's far end, c 20 m from a
    const stops = [stop(50, 14.6, [[1, 999], [2, 7]]), stop(50.002, 14.602, [[0, 999]]), stop(50.00018, 14.6, [[0, 7]])];
    streetTransfers(stops, g);
    const m = 143.4 + 222.6; // 0.002° east at 50°N + 0.002° north
    expect(stops[0].transfers[0][1]).toBeCloseTo(walkSec(m, false), -1);
    expect(stops[1].transfers[0][1]).toBe(stops[0].transfers[0][1]);
    expect(stops[0].transfers[1][1]).toBe(7);
  });
});
