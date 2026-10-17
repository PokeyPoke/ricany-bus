import { haversine, type FreeRouteId, type Vehicle } from '@rb/shared';

type LonLat = [number, number];

interface Track { v: Vehicle; path: LonLat[]; cum: number[]; t0: number; dur: number }

const MAX_JUMP_M = 1500;
const MIN_DUR_MS = 2000, MAX_DUR_MS = 15_000;
const ON_SHAPE_M = 40;

const dist = (a: LonLat, b: LonLat) => haversine(a[1], a[0], b[1], b[0]);

function cumulative(path: LonLat[]): number[] {
  const c = [0];
  for (let i = 1; i < path.length; i++) c.push(c[i - 1] + dist(path[i - 1], path[i]));
  return c;
}

/** Nearest point of `p` on the polyline: its distance from it and its position (meters along). */
function project(shape: LonLat[], cum: number[], p: LonLat): { d: number; along: number; seg: number; pt: LonLat } {
  const k = 111_320 * Math.cos((p[1] * Math.PI) / 180), ky = 110_574;
  let best = { d: Infinity, along: 0, seg: 0, pt: p };
  for (let i = 0; i + 1 < shape.length; i++) {
    const ax = (shape[i][0] - p[0]) * k, ay = (shape[i][1] - p[1]) * ky;
    const bx = (shape[i + 1][0] - p[0]) * k, by = (shape[i + 1][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.d) {
      best = { d, along: cum[i] + t * (cum[i + 1] - cum[i]), seg: i, pt: [shape[i][0] + t * (shape[i + 1][0] - shape[i][0]), shape[i][1] + t * (shape[i + 1][1] - shape[i][1])] };
    }
  }
  return best;
}

/** The stretch of one of `shapes` that runs forward from a to b, or null if none fits. */
export function alongShape(shapes: LonLat[][], a: LonLat, b: LonLat): LonLat[] | null {
  const straight = dist(a, b);
  let best: LonLat[] | null = null, bestLen = Infinity;
  for (const s of shapes) {
    if (s.length < 2) continue;
    const cum = cumulative(s);
    const pa = project(s, cum, a), pb = project(s, cum, b);
    const len = pb.along - pa.along;
    if (pa.d > ON_SHAPE_M || pb.d > ON_SHAPE_M || len < 0 || len > straight * 3 + 50 || len >= bestLen) continue;
    const path: LonLat[] = [a, pa.pt];
    for (let i = pa.seg + 1; i <= pb.seg; i++) path.push(s[i]);
    path.push(pb.pt, b);
    best = path; bestLen = len;
  }
  return best;
}

function pointAt(tr: Track, nowMs: number): LonLat {
  const total = tr.cum[tr.cum.length - 1];
  const f = tr.dur > 0 ? Math.max(0, Math.min(1, (nowMs - tr.t0) / tr.dur)) : 1;
  if (f >= 1 || total === 0) return tr.path[tr.path.length - 1];
  const want = f * total;
  let i = 1;
  while (i < tr.cum.length - 1 && tr.cum[i] < want) i++;
  const seg = tr.cum[i] - tr.cum[i - 1], t = seg > 0 ? (want - tr.cum[i - 1]) / seg : 1;
  return [tr.path[i - 1][0] + t * (tr.path[i][0] - tr.path[i - 1][0]), tr.path[i - 1][1] + t * (tr.path[i][1] - tr.path[i - 1][1])];
}

/**
 * Glides live buses from where they are drawn to each newly reported position, following the line's shape.
 * A glide lasts as long as the gap between the two reports (2–15 s), so buses move steadily rather than jump.
 */
export class BusMotion {
  private tracks = new Map<string, Track>();
  constructor(private shapes: (routeId: FreeRouteId) => LonLat[][]) {}

  update(vehicles: Vehicle[], nowMs: number, animate = true): void {
    const next = new Map<string, Track>();
    for (const v of vehicles) {
      const prev = this.tracks.get(v.tripId);
      const to: LonLat = [v.lon, v.lat];
      if (prev && prev.v.ts === v.ts) { next.set(v.tripId, { ...prev, v }); continue; }
      const from = prev ? pointAt(prev, nowMs) : to;
      const moved = dist(from, to);
      if (!prev || !animate || moved < 1 || moved > MAX_JUMP_M) {
        next.set(v.tripId, { v, path: [to], cum: [0], t0: nowMs, dur: 0 });
        continue;
      }
      const path = alongShape(this.shapes(v.routeId), from, to) ?? [from, to];
      const dur = Math.max(MIN_DUR_MS, Math.min(MAX_DUR_MS, (v.ts - prev.v.ts) * 1000));
      next.set(v.tripId, { v, path, cum: cumulative(path), t0: nowMs, dur });
    }
    this.tracks = next;
  }

  /** The vehicles as they should be drawn at `nowMs`. */
  at(nowMs: number): Vehicle[] {
    return [...this.tracks.values()].map((tr) => {
      const [lon, lat] = pointAt(tr, nowMs);
      return lon === tr.v.lon && lat === tr.v.lat ? tr.v : { ...tr.v, lon, lat };
    });
  }

  moving(nowMs: number): boolean {
    for (const tr of this.tracks.values()) if (tr.dur > 0 && nowMs < tr.t0 + tr.dur) return true;
    return false;
  }
}
