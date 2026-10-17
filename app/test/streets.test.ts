import { describe, it, expect } from 'vitest';
import { StreetGraph, WALK, haversine, walkSec, type StreetsFile } from '@rb/shared';
import { nearestOnFoot } from '../src/lib/streets';

// one street along 50.000 from 14.600 to 14.620; a fence-like gap: no street to the north side
const file: StreetsFile = { v: 1, generatedAt: '', nodes: [5000000, 1460000, 5000000, 1462000], edges: [0, 1, WALK], geom: [[]] };
const g = new StreetGraph(file);
const from = { lat: 50, lon: 14.6 };

describe('nearestOnFoot', () => {
  const a = { id: 'a', lat: 50, lon: 14.61 }; // 715 m along the street
  const b = { id: 'b', lat: 50.0045, lon: 14.6 }; // 500 m away by air, 300 m+ off any street → straight-line fallback
  const c = { id: 'c', lat: 50, lon: 14.605 };
  it('ranks by straight-line meters without a graph', () => {
    expect(nearestOnFoot(null, from, [a, b, c], 2).map((x) => x.item.id)).toEqual(['c', 'b']);
  });
  it('ranks by street meters with a graph', () => {
    const r = nearestOnFoot(g, from, [a, c], 2);
    expect(r.map((x) => x.item.id)).toEqual(['c', 'a']);
    expect(r[1].m).toBe(Math.round(haversine(50, 14.6, 50, 14.61)));
  });
  it('drops items beyond the limit', () => {
    expect(nearestOnFoot(g, from, [a], 1, 300)).toEqual([]);
  });
  it('keeps far items with a straight-line estimate when there is no limit', () => {
    const far = { id: 'far', lat: 50, lon: 14.7 }; // 7 km: beyond the 3.5 km street search
    expect(nearestOnFoot(g, from, [far], 1, Infinity)[0]).toMatchObject({ m: Math.round(haversine(50, 14.6, 50, 14.7)), sec: walkSec(haversine(50, 14.6, 50, 14.7)) });
  });
});
