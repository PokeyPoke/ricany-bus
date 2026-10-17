import { LINE_ORDER, type FreeRouteId, type LineRec } from '@rb/shared';

type LonLat = [number, number];

/** A stretch of one line's route with a constant side-by-side slot. */
export interface ParallelRun { routeId: FreeRouteId; dir: number; coords: LonLat[]; off: number }

const STEP_M = 10;
const NEAR_M = 15;
const PARALLEL_COS = 0.8;
const CELL = 0.0005; // degrees, ~35–55 m

const KX = 111_320 * Math.cos((50 * Math.PI) / 180), KY = 110_574; // local metres per degree around Říčany
const toXY = ([lon, lat]: LonLat): [number, number] => [lon * KX, lat * KY];

function resample(shape: LonLat[]): LonLat[] {
  const out: LonLat[] = [shape[0]];
  for (let i = 1; i < shape.length; i++) {
    const [ax, ay] = toXY(shape[i - 1]), [bx, by] = toXY(shape[i]);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP_M));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([shape[i - 1][0] + t * (shape[i][0] - shape[i - 1][0]), shape[i - 1][1] + t * (shape[i][1] - shape[i - 1][1])]);
    }
  }
  return out;
}

interface Seg { routeId: FreeRouteId; ax: number; ay: number; bx: number; by: number; ux: number; uy: number }

/**
 * Splits every line's route into runs and gives each run a side-by-side offset (in line widths) so that lines
 * sharing a road are drawn next to each other: slots follow LINE_ORDER, and the side is fixed geographically
 * (not by travel direction) so both directions of a line sit on the same side of the road.
 */
export function parallelRuns(lines: LineRec[]): ParallelRun[] {
  const grid = new Map<string, Seg[]>();
  const key = (lon: number, lat: number) => `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`;
  for (const l of lines) {
    for (const d of l.directions) {
      for (let i = 1; i < d.shape.length; i++) {
        const [ax, ay] = toXY(d.shape[i - 1]), [bx, by] = toXY(d.shape[i]);
        const len = Math.hypot(bx - ax, by - ay);
        if (len === 0) continue;
        const seg: Seg = { routeId: l.routeId, ax, ay, bx, by, ux: (bx - ax) / len, uy: (by - ay) / len };
        const [lo0, la0] = d.shape[i - 1], [lo1, la1] = d.shape[i];
        for (let x = Math.floor(Math.min(lo0, lo1) / CELL) - 1; x <= Math.floor(Math.max(lo0, lo1) / CELL) + 1; x++) {
          for (let y = Math.floor(Math.min(la0, la1) / CELL) - 1; y <= Math.floor(Math.max(la0, la1) / CELL) + 1; y++) {
            const k = `${x},${y}`;
            let list = grid.get(k);
            if (!list) grid.set(k, (list = []));
            list.push(seg);
          }
        }
      }
    }
  }
  const order = (r: FreeRouteId) => LINE_ORDER.indexOf(r);

  const runs: ParallelRun[] = [];
  for (const l of lines) {
    l.directions.forEach((d, dir) => {
      if (d.shape.length < 2) return;
      const pts = resample(d.shape);
      // per sample: slot among the lines sharing the road (centred), and which lines those are
      const slots = pts.map((p, i) => {
        const q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
        const [px, py] = toXY(p), [qx, qy] = toXY(q), [rx, ry] = toXY(r);
        const hl = Math.hypot(qx - rx, qy - ry) || 1, hx = (qx - rx) / hl, hy = (qy - ry) / hl;
        const here = new Set<FreeRouteId>([l.routeId]);
        for (const s of grid.get(key(p[0], p[1])) ?? []) {
          if (here.has(s.routeId) || Math.abs(hx * s.ux + hy * s.uy) < PARALLEL_COS) continue;
          const t = Math.max(0, Math.min(1, ((px - s.ax) * (s.bx - s.ax) + (py - s.ay) * (s.by - s.ay)) / ((s.bx - s.ax) ** 2 + (s.by - s.ay) ** 2)));
          if (Math.hypot(s.ax + t * (s.bx - s.ax) - px, s.ay + t * (s.by - s.ay) - py) <= NEAR_M) here.add(s.routeId);
        }
        const sorted = [...here].sort((a, b) => order(a) - order(b));
        return { slot: sorted.indexOf(l.routeId) - (sorted.length - 1) / 2, set: sorted.join() };
      });
      // drop one-sample blips (a crossing street) so runs do not flicker
      for (let i = 1; i + 1 < slots.length; i++) if (slots[i - 1].set === slots[i + 1].set && slots[i].set !== slots[i - 1].set) slots[i] = slots[i - 1];
      let start = 0;
      for (let i = 1; i <= pts.length; i++) {
        if (i < pts.length && slots[i].set === slots[start].set) continue;
        const coords = pts.slice(start, Math.min(i + 1, pts.length));
        // line-offset is to the right of travel; flip stretches running west (or due south) so the side is geographic
        // and both directions of a line land on the same side of the road
        const [ax, ay] = toXY(coords[0]), [bx, by] = toXY(coords[coords.length - 1]);
        const sign = bx - ax > 1e-6 || (Math.abs(bx - ax) <= 1e-6 && by > ay) ? 1 : -1;
        runs.push({ routeId: l.routeId, dir, coords, off: slots[start].slot * sign || 0 });
        start = i;
      }
    });
  }
  return runs.filter((r) => r.coords.length >= 2);
}
