import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MIN_TRANSFER_SEC, weekday, type StopsFile, type TimetableFile } from '@rb/shared';
import { buildNetwork, type Network } from '../src/router/network';
import { raptor } from '../src/router/raptor';
import { planTrip } from '../src/router/plan';

const load = <T>(n: string): T => JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), 'utf8'));
const { stops } = load<StopsFile>('stops');
const tt = load<TimetableFile>('timetable');
const date = Object.keys(tt.servicesByDate).sort().find((d) => weekday(d) <= 4 && tt.servicesByDate[d].length)!;
const net = buildNetwork(stops, tt, date);

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Earliest arrival using ≤ 2 rides, enumerating every trip combination. Independent of RAPTOR. */
function brute(n: Network, from: number, to: number, t0: number): number {
  let best = Infinity;
  const rides = (stop: number, ready: number, cb: (s: number, arr: number) => void) => {
    for (const { p, pos } of n.stopPatterns[stop]) {
      const pat = n.patterns[p];
      for (const tr of pat.trips) {
        if (tr.dep[pos] < ready) continue;
        for (let j = pos + 1; j < pat.stops.length; j++) cb(pat.stops[j], tr.arr[j]);
      }
    }
  };
  const reach = (s: number, a: number) => {
    if (s === to) best = Math.min(best, a);
    for (const [t2, w] of n.stops[s].transfers) if (t2 === to) best = Math.min(best, a + w);
  };
  rides(from, t0, (s1, a1) => {
    reach(s1, a1);
    const next: [number, number][] = [[s1, a1 + MIN_TRANSFER_SEC], ...n.stops[s1].transfers.map(([s2, w]) => [s2, a1 + w] as [number, number])];
    for (const [s2, r2] of next) rides(s2, r2, (s3, a3) => reach(s3, a3));
  });
  return best;
}

describe(`golden: real data on ${date}`, () => {
  it('RAPTOR (≤ 2 rides) matches brute force on 40 random stop pairs', () => {
    const r = rng(42);
    let compared = 0;
    for (let i = 0; i < 40; i++) {
      const from = Math.floor(r() * stops.length);
      const to = Math.floor(r() * stops.length);
      if (from === to) continue;
      const t0 = 6 * 3600 + Math.floor(r() * 12 * 3600);
      const js = raptor(net, [{ stop: from, sec: 0 }], [{ stop: to, sec: 0 }], t0, 2);
      const got = js.length ? Math.min(...js.map((j) => j.arrive)) : Infinity;
      expect(got, `${stops[from].name} → ${stops[to].name} @ ${t0}`).toBe(brute(net, from, to, t0));
      compared++;
    }
    console.log(`GOLDEN compared=${compared}`);
    expect(compared).toBeGreaterThan(30);
  });

  it('planTrip averages < 100 ms on real data', () => {
    const r = rng(7);
    const ctx = { stops, netFor: (d: string) => (d === date ? net : buildNetwork(stops, tt, d)) };
    const t = performance.now();
    for (let i = 0; i < 20; i++) {
      const a = stops[Math.floor(r() * stops.length)], b = stops[Math.floor(r() * stops.length)];
      planTrip(ctx, { from: { lat: a.lat, lon: a.lon, name: 'a' }, to: { lat: b.lat, lon: b.lon, name: 'b' }, mode: 'dep', date, sec: 7 * 3600 + i * 600 }, null);
    }
    const avg = (performance.now() - t) / 20;
    console.log(`GOLDEN avg_ms=${avg.toFixed(2)}`);
    expect(avg).toBeLessThan(100);
  });

  it('every free line appears in the data and only free route_ids exist', () => {
    const ids = new Set(tt.patterns.map((p) => p.routeId));
    expect([...ids].sort()).toEqual(['L1731', 'L1732', 'L1733', 'L1734', 'L1735', 'L1736', 'L1737']);
  });
});
