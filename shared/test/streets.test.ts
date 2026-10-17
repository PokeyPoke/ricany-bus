import { describe, it, expect } from 'vitest';
import { BIKE_BACK, BIKE_FWD, StreetGraph, WALK, haversine, type StreetsFile } from '../src/index';

// A 3×2 grid of nodes ~111 m apart (0.001° lat, ~0.00155° lon at 50°N):
//   3 — 4 — 5
//   |   |   |
//   0 — 1 — 2
const LAT = 50, DLA = 0.001, DLO = 0.00155;
const node = (r: number, c: number) => [Math.round((LAT + r * DLA) * 1e5), Math.round((14.6 + c * DLO) * 1e5)];
const ALL = WALK | BIKE_FWD | BIKE_BACK;
function grid(over: Record<string, number> = {}): StreetsFile {
  const nodes = [node(0, 0), node(0, 1), node(0, 2), node(1, 0), node(1, 1), node(1, 2)].flat();
  const pairs: [number, number][] = [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]];
  return { v: 1, generatedAt: '', nodes, edges: pairs.flatMap(([a, b]) => [a, b, over[`${a}-${b}`] ?? ALL]), geom: pairs.map(() => []) };
}

describe('StreetGraph', () => {
  it('snaps to the nearest street and measures along it', () => {
    const g = new StreetGraph(grid());
    const s = g.snap(LAT + 0.0002, 14.6 + DLO / 2)!.cands[0]; // just north of edge 0–1, midway
    expect(s.edge).toBe(0);
    expect(s.gap).toBeGreaterThan(15);
    expect(s.gap).toBeLessThan(30);
    expect(s.off).toBeCloseTo(haversine(LAT, 14.6, LAT, 14.6 + DLO) / 2, 0);
    expect(g.snap(LAT + 0.05, 14.6)).toBeNull();
  });

  it('routes around the block and returns a connected path', () => {
    const g = new StreetGraph(grid());
    const from = g.snap(LAT, 14.6)!, to = g.snap(LAT + DLA, 14.6 + 2 * DLO)!;
    const tr = g.search(from, 'walk', 5000);
    const m = g.meters(tr, to)!;
    const side = haversine(LAT, 14.6, LAT, 14.6 + DLO), up = haversine(LAT, 14.6, LAT + DLA, 14.6);
    expect(m).toBeCloseTo(2 * side + up, 0);
    const p = g.path(tr, to)!;
    expect(p[0]).toEqual([14.6, LAT]);
    expect(p[p.length - 1][0]).toBeCloseTo(14.6 + 2 * DLO, 5);
    expect(p[p.length - 1][1]).toBeCloseTo(LAT + DLA, 5);
    let len = 0;
    for (let i = 1; i < p.length; i++) len += haversine(p[i - 1][1], p[i - 1][0], p[i][1], p[i][0]);
    expect(len).toBeCloseTo(m, 0);
  });

  it('handles source and target on the same edge', () => {
    const g = new StreetGraph(grid());
    const a = g.snap(LAT, 14.6 + DLO * 0.2)!, b = g.snap(LAT, 14.6 + DLO * 0.7)!;
    const m = g.meters(g.search(a, 'walk', 5000), b)!;
    expect(m).toBeCloseTo(haversine(LAT, 14.6 + DLO * 0.2, LAT, 14.6 + DLO * 0.7), 0);
    expect(g.path(g.search(a, 'walk', 5000), b)!.length).toBeGreaterThanOrEqual(2);
  });

  it('bikes respect one-way edges, walkers do not', () => {
    // 0→1 is one-way eastbound for bikes; westbound bikes must go round via 3–4
    const g = new StreetGraph(grid({ '0-1': WALK | BIKE_FWD }));
    const east = g.snap(LAT, 14.6 + DLO)!, west = g.snap(LAT, 14.6)!;
    const side = haversine(LAT, 14.6, LAT, 14.6 + DLO), up = haversine(LAT, 14.6, LAT + DLA, 14.6);
    const bw = g.snap(LAT, 14.6 + DLO, 'bike')!, bwest = g.snap(LAT, 14.6, 'bike')!;
    expect(g.meters(g.search(bw, 'bike', 5000), bwest)).toBeCloseTo(side + 2 * up, 0);
    expect(g.meters(g.search(bwest, 'bike', 5000), bw)).toBeCloseTo(side, 0);
    expect(g.meters(g.search(east, 'walk', 5000), west)).toBeCloseTo(side, 0);
  });

  it('stops at maxM and walkers ignore bike-only edges', () => {
    const g = new StreetGraph(grid({ '1-2': BIKE_FWD | BIKE_BACK, '4-5': BIKE_FWD | BIKE_BACK, '2-5': BIKE_FWD | BIKE_BACK }));
    const from = g.snap(LAT, 14.6)!;
    expect(g.meters(g.search(from, 'walk', 5000), g.snap(LAT, 14.6 + 2 * DLO, 'bike')!)).toBeNull();
    expect(g.meters(g.search(from, 'walk', 50), g.snap(LAT + DLA, 14.6 + DLO)!)).toBeNull();
  });

  it('joins every street near the nearest one, so a sidewalk does not force a detour', () => {
    // a "sidewalk" 5 m north of edge 0–1, connected to the grid only at node 2's end
    const f = grid();
    const n = f.nodes.length / 2;
    f.nodes.push(Math.round((LAT + 0.000045) * 1e5), Math.round(14.6 * 1e5), Math.round((LAT + 0.000045) * 1e5), Math.round((14.6 + 2 * DLO) * 1e5));
    f.edges.push(n, n + 1, WALK, n + 1, 2, WALK);
    f.geom.push([], []);
    const g = new StreetGraph(f);
    const from = g.snap(LAT + 0.00006, 14.6 + DLO * 0.1)!; // on the sidewalk side, nearest to the sidewalk
    expect(from.cands.length).toBeGreaterThanOrEqual(2);
    const to = g.snap(LAT, 14.6)!;
    const m = g.meters(g.search(from, 'walk', 5000), to)!;
    expect(m).toBeLessThan(haversine(LAT, 14.6, LAT, 14.6 + DLO * 0.1) + 15);
  });

  it('decodes delta-coded intermediate points', () => {
    const f = grid();
    // bend edge 0–1 through a point 0.0005° north of its midpoint
    f.geom[0] = [50, Math.round(DLO * 1e5 / 2)];
    const g = new StreetGraph(f);
    const leg = haversine(LAT, 14.6, LAT + 0.0005, 14.6 + DLO / 2);
    expect(g.len[0]).toBeCloseTo(2 * leg, 0);
  });
});
