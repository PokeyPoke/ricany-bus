import { haversine } from './geo';

/**
 * Compact street graph (app/public/data/streets.json), built from OpenStreetMap by `npm run streets`.
 * Coordinates are integers in 1e-5 degrees (about 1 m).
 */
export interface StreetsFile {
  v: 1;
  generatedAt: string;
  /** flat [lat, lon] per graph node */
  nodes: number[];
  /** flat [a, b, flags] per edge; flags: WALK | BIKE_FWD (a→b) | BIKE_BACK (b→a) */
  edges: number[];
  /** per edge: intermediate points between a and b as [dlat, dlon, ...] deltas, the first relative to node a */
  geom: number[][];
}

export const WALK = 1, BIKE_FWD = 2, BIKE_BACK = 4;
export type StreetMode = 'walk' | 'bike';

const Q = 1e5;
const CELL = 0.002; // degrees, about 150–220 m

/** A point projected onto the nearest usable street. */
export interface Snap {
  lat: number; lon: number;
  edge: number;
  /** meters from node a along the edge */
  off: number;
  /** straight-line meters from the original point to the street */
  gap: number;
  /** the original point */
  from: [number, number];
}

export interface Tree { dist: Float64Array; prev: Int32Array; source: Snap; mode: StreetMode; maxM: number }

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lk;
        if (l < k.length && k[l] < mk) { m = l; mk = k[l]; }
        if (r < k.length && k[r] < mk) { m = r; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

export class StreetGraph {
  readonly lat: Float64Array;
  readonly lon: Float64Array;
  readonly ea: Int32Array;
  readonly eb: Int32Array;
  readonly flags: Uint8Array;
  readonly len: Float64Array;
  /** polyline per edge from a to b, flat [lat, lon, ...] in degrees */
  readonly pts: Float64Array[];
  /** per edge: cumulative meters at each polyline point */
  readonly cum: Float64Array[];
  private adjStart: Int32Array;
  private adj: Int32Array; // edge indexes
  private grid = new Map<number, number[]>();

  constructor(f: StreetsFile) {
    const n = f.nodes.length / 2, m = f.edges.length / 3;
    this.lat = new Float64Array(n); this.lon = new Float64Array(n);
    for (let i = 0; i < n; i++) { this.lat[i] = f.nodes[2 * i] / Q; this.lon[i] = f.nodes[2 * i + 1] / Q; }
    this.ea = new Int32Array(m); this.eb = new Int32Array(m); this.flags = new Uint8Array(m); this.len = new Float64Array(m);
    this.pts = new Array(m); this.cum = new Array(m);
    const deg = new Int32Array(n + 1);
    for (let e = 0; e < m; e++) {
      const a = f.edges[3 * e], b = f.edges[3 * e + 1];
      this.ea[e] = a; this.eb[e] = b; this.flags[e] = f.edges[3 * e + 2];
      const g = f.geom[e] ?? [];
      const p = new Float64Array(g.length + 4);
      let la = f.nodes[2 * a], lo = f.nodes[2 * a + 1];
      p[0] = la / Q; p[1] = lo / Q;
      for (let i = 0; i < g.length; i += 2) { la += g[i]; lo += g[i + 1]; p[i + 2] = la / Q; p[i + 3] = lo / Q; }
      p[p.length - 2] = this.lat[b]; p[p.length - 1] = this.lon[b];
      const c = new Float64Array(p.length / 2);
      for (let i = 1; i < c.length; i++) c[i] = c[i - 1] + haversine(p[2 * i - 2], p[2 * i - 1], p[2 * i], p[2 * i + 1]);
      this.pts[e] = p; this.cum[e] = c; this.len[e] = c[c.length - 1];
      deg[a]++; deg[b]++;
      this.index(e, p);
    }
    this.adjStart = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) this.adjStart[i + 1] = this.adjStart[i] + deg[i];
    this.adj = new Int32Array(this.adjStart[n]);
    const fill = this.adjStart.slice(0, n);
    for (let e = 0; e < m; e++) { this.adj[fill[this.ea[e]]++] = e; this.adj[fill[this.eb[e]]++] = e; }
  }

  get nodeCount() { return this.lat.length; }
  get edgeCount() { return this.ea.length; }

  private cellKey(cy: number, cx: number) { return cy * 100003 + cx; }

  private index(e: number, p: Float64Array) {
    const seen = new Set<number>();
    for (let i = 0; i + 3 < p.length; i += 2) {
      const y0 = Math.floor(Math.min(p[i], p[i + 2]) / CELL), y1 = Math.floor(Math.max(p[i], p[i + 2]) / CELL);
      const x0 = Math.floor(Math.min(p[i + 1], p[i + 3]) / CELL), x1 = Math.floor(Math.max(p[i + 1], p[i + 3]) / CELL);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const k = this.cellKey(y, x);
          if (seen.has(k)) continue;
          seen.add(k);
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(e);
        }
      }
    }
  }

  private usable(e: number, mode: StreetMode) {
    return mode === 'walk' ? (this.flags[e] & WALK) !== 0 : (this.flags[e] & (BIKE_FWD | BIKE_BACK)) !== 0;
  }

  /** Nearest point on a street usable by `mode`, within maxM meters. */
  snap(lat: number, lon: number, mode: StreetMode = 'walk', maxM = 300): Snap | null {
    const kx = 111_320 * Math.cos((lat * Math.PI) / 180), ky = 110_574;
    const cy = Math.floor(lat / CELL), cx = Math.floor(lon / CELL);
    const r = Math.ceil(maxM / (CELL * Math.min(kx, ky))) + 1;
    let best: Snap | null = null, bestD = maxM;
    const seen = new Set<number>();
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        for (const e of this.grid.get(this.cellKey(y, x)) ?? []) {
          if (seen.has(e) || !this.usable(e, mode)) continue;
          seen.add(e);
          const p = this.pts[e];
          for (let i = 0; i + 3 < p.length; i += 2) {
            const ax = (p[i + 1] - lon) * kx, ay = (p[i] - lat) * ky;
            const bx = (p[i + 3] - lon) * kx, by = (p[i + 2] - lat) * ky;
            const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
            const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
            const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(px, py);
            if (d < bestD) {
              bestD = d;
              const c = this.cum[e];
              best = { lat: lat + py / ky, lon: lon + px / kx, edge: e, off: c[i / 2] + t * (c[i / 2 + 1] - c[i / 2]), gap: d, from: [lat, lon] };
            }
          }
        }
      }
    }
    return best;
  }

  private canGo(e: number, fromNode: number, mode: StreetMode) {
    const f = this.flags[e];
    if (mode === 'walk') return (f & WALK) !== 0;
    return this.ea[e] === fromNode ? (f & BIKE_FWD) !== 0 : (f & BIKE_BACK) !== 0;
  }

  /** Shortest street meters from `s` to every node, up to maxM. */
  search(s: Snap, mode: StreetMode, maxM: number): Tree {
    const n = this.nodeCount;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const h = new Heap();
    const e0 = s.edge, a0 = this.ea[e0], b0 = this.eb[e0];
    if (this.canGo(e0, b0, mode)) { dist[a0] = s.off; prev[a0] = -2; h.push(s.off, a0); }
    if (this.canGo(e0, a0, mode) && this.len[e0] - s.off < dist[b0]) { dist[b0] = this.len[e0] - s.off; prev[b0] = -2; h.push(dist[b0], b0); }
    while (h.size) {
      const [d, u] = h.pop();
      if (d > dist[u] || d > maxM) continue;
      for (let i = this.adjStart[u]; i < this.adjStart[u + 1]; i++) {
        const e = this.adj[i];
        if (!this.canGo(e, u, mode)) continue;
        const v = this.ea[e] === u ? this.eb[e] : this.ea[e];
        const nd = d + this.len[e];
        if (nd < dist[v]) { dist[v] = nd; prev[v] = e; h.push(nd, v); }
      }
    }
    return { dist, prev, source: s, mode, maxM };
  }

  /** Street meters from the tree's source snap to `t` (not counting the off-street gaps), or null. */
  private reach(tr: Tree, t: Snap): { m: number; via: number } | null {
    const e = t.edge, a = this.ea[e], b = this.eb[e];
    let m = Infinity, via = -1;
    if (this.canGo(e, a, tr.mode) && tr.dist[a] + t.off < m) { m = tr.dist[a] + t.off; via = a; }
    if (this.canGo(e, b, tr.mode) && tr.dist[b] + this.len[e] - t.off < m) { m = tr.dist[b] + this.len[e] - t.off; via = b; }
    const s = tr.source;
    if (s.edge === e) {
      const fwd = t.off >= s.off;
      if (this.canGo(e, fwd ? a : b, tr.mode) && Math.abs(t.off - s.off) < m) { m = Math.abs(t.off - s.off); via = -3; }
    }
    return m <= tr.maxM ? { m, via } : null;
  }

  /** Total meters including both off-street gaps, or null if unreachable within the tree. */
  meters(tr: Tree, t: Snap): number | null {
    const r = this.reach(tr, t);
    return r ? r.m + tr.source.gap + t.gap : null;
  }

  /** Polyline from the tree's source point to `t`'s point as [lon, lat] pairs. */
  path(tr: Tree, t: Snap): [number, number][] | null {
    const r = this.reach(tr, t);
    if (!r) return null;
    const s = tr.source;
    const add = (out: [number, number][], lat: number, lon: number) => {
      const last = out[out.length - 1];
      if (!last || Math.abs(last[0] - lon) > 1e-7 || Math.abs(last[1] - lat) > 1e-7) out.push([lon, lat]);
    };
    if (r.via === -3) {
      const out: [number, number][] = [];
      add(out, s.from[0], s.from[1]); add(out, s.lat, s.lon);
      for (const q of this.slice(s.edge, s.off, t.off)) add(out, q[1], q[0]);
      add(out, t.lat, t.lon); add(out, t.from[0], t.from[1]);
      return out;
    }
    // walk back from the target's entry node to the source edge
    const segs: [number, number][][] = [];
    segs.push(this.slice(t.edge, r.via === this.ea[t.edge] ? 0 : this.len[t.edge], t.off));
    let u = r.via;
    while (tr.prev[u] >= 0) {
      const e = tr.prev[u];
      const fromA = this.eb[e] === u; // traversed a→b
      segs.push(fromA ? this.slice(e, 0, this.len[e]) : this.slice(e, this.len[e], 0));
      u = fromA ? this.ea[e] : this.eb[e];
    }
    segs.push(this.slice(s.edge, s.off, u === this.ea[s.edge] ? 0 : this.len[s.edge]));
    const out: [number, number][] = [];
    add(out, s.from[0], s.from[1]); add(out, s.lat, s.lon);
    for (let i = segs.length - 1; i >= 0; i--) for (const q of segs[i]) add(out, q[1], q[0]);
    add(out, t.lat, t.lon); add(out, t.from[0], t.from[1]);
    return out;
  }

  /** Points of edge e between offsets o0 → o1 (meters from a), as [lon, lat], in travel order. */
  private slice(e: number, o0: number, o1: number): [number, number][] {
    const p = this.pts[e], c = this.cum[e];
    const at = (o: number): [number, number] => {
      let i = 0;
      while (i < c.length - 2 && c[i + 1] < o) i++;
      const seg = c[i + 1] - c[i], t = seg > 0 ? Math.max(0, Math.min(1, (o - c[i]) / seg)) : 0;
      return [p[2 * i + 1] + t * (p[2 * i + 3] - p[2 * i + 1]), p[2 * i] + t * (p[2 * i + 2] - p[2 * i])];
    };
    const out: [number, number][] = [at(o0)];
    if (o1 >= o0) { for (let i = 1; i < c.length - 1; i++) if (c[i] > o0 && c[i] < o1) out.push([p[2 * i + 1], p[2 * i]]); }
    else { for (let i = c.length - 2; i >= 1; i--) if (c[i] < o0 && c[i] > o1) out.push([p[2 * i + 1], p[2 * i]]); }
    out.push(at(o1));
    return out;
  }
}
