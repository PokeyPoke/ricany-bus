import type { PlaceRef } from '../router/types';
export type { PlaceRef };

export type PlanMode = 'now' | 'dep' | 'arr';
export type Route =
  | { name: 'home'; date?: string; time?: string }
  | { name: 'plan'; from?: PlaceRef; to?: PlaceRef; mode: PlanMode; date?: string; time?: string; sel?: string }
  | { name: 'stop'; stopId: string; date?: string; time?: string }
  | { name: 'line'; number: string; dir: number; stopId?: string; date?: string }
  | { name: 'about' }
  | { name: 'bike'; uid: number }
  | { name: 'bus'; tripId: string }
  | { name: 'from'; groupId: string; line?: string; dir?: number }
  | { name: 'ride'; line: string; dir: number; from: string; to: string };

const encPlace = (p: PlaceRef) => `${+p.lat.toFixed(6)},${+p.lon.toFixed(6)},${p.name}`;
function decPlace(s: string | null): PlaceRef | undefined {
  if (!s) return undefined;
  const [lat, lon, ...rest] = s.split(',');
  const p = { lat: Number(lat), lon: Number(lon), name: rest.join(',') };
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && lat !== '' && lon !== '' ? p : undefined;
}
/** index into LineRec.directions (a direction or one of its route variants); anything else → 0 */
const dirIdx = (v: string | null): number => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < 16 ? n : 0; };
const opt = (v: string | null) => v ?? undefined;
const validDate = (v: string | null) => (v && /^\d{8}$/.test(v) ? v : undefined);
const validTime = (v: string | null) => (v && /^\d{1,2}:\d{2}$/.test(v) ? v : undefined);
/** optional moment for boards ("departures at …"): both parts or nothing */
function at(q: URLSearchParams): { date?: string; time?: string } {
  const date = validDate(q.get('d')), time = validTime(q.get('t'));
  return date && time ? { date, time } : {};
}
const atQuery = (r: { date?: string; time?: string }) => (r.date && r.time ? `?${new URLSearchParams({ d: r.date, t: r.time })}` : '');

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const q = new URLSearchParams(query);
  let parts: string[];
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { name: 'home' };
  }
  switch (parts[0]) {
    case 'plan': {
      const m = q.get('mode');
      const mode: PlanMode = m === 'dep' || m === 'arr' ? m : 'now';
      return { name: 'plan', mode, from: decPlace(q.get('from')), to: decPlace(q.get('to')), date: opt(q.get('d')), time: opt(q.get('t')), sel: opt(q.get('sel')) };
    }
    case 'stop':
      return parts[1] ? { name: 'stop', stopId: parts[1], ...at(q) } : { name: 'home' };
    case 'line': {
      if (!parts[1]) return { name: 'home' };
      const d = validDate(q.get('d'));
      return { name: 'line', number: parts[1], dir: dirIdx(q.get('dir')), stopId: opt(q.get('stop')), ...(d ? { date: d } : {}) };
    }
    case 'about':
      return { name: 'about' };
    case 'bike': {
      const uid = Number(parts[1]);
      return parts[1] && Number.isFinite(uid) ? { name: 'bike', uid } : { name: 'home' };
    }
    case 'bus':
      return parts[1] ? { name: 'bus', tripId: parts[1] } : { name: 'home' };
    case 'from': {
      if (!parts[1]) return { name: 'home' };
      const line = q.get('line') || undefined;
      return { name: 'from', groupId: parts[1], line, dir: line ? dirIdx(q.get('dir')) : undefined };
    }
    case 'ride': {
      const line = q.get('line'), from = q.get('from'), to = q.get('to');
      return line && from && to ? { name: 'ride', line, dir: dirIdx(q.get('dir')), from, to } : { name: 'home' };
    }
    default:
      return { name: 'home', ...at(q) };
  }
}

export function formatRoute(r: Route): string {
  switch (r.name) {
    case 'home':
      return `#/${atQuery(r)}`;
    case 'plan': {
      const q = new URLSearchParams();
      if (r.from) q.set('from', encPlace(r.from));
      if (r.to) q.set('to', encPlace(r.to));
      q.set('mode', r.mode);
      if (r.date) q.set('d', r.date);
      if (r.time) q.set('t', r.time);
      if (r.sel) q.set('sel', r.sel);
      return `#/plan?${q}`;
    }
    case 'stop':
      return `#/stop/${encodeURIComponent(r.stopId)}${atQuery(r)}`;
    case 'line': {
      const q = new URLSearchParams({ dir: String(r.dir) });
      if (r.stopId) q.set('stop', r.stopId);
      if (r.date) q.set('d', r.date);
      return `#/line/${encodeURIComponent(r.number)}?${q}`;
    }
    case 'about':
      return '#/about';
    case 'bike':
      return `#/bike/${r.uid}`;
    case 'bus':
      return `#/bus/${encodeURIComponent(r.tripId)}`;
    case 'from': {
      const q = new URLSearchParams();
      if (r.line) { q.set('line', r.line); q.set('dir', String(r.dir ?? 0)); }
      const qs = q.toString();
      return `#/from/${encodeURIComponent(r.groupId)}${qs ? `?${qs}` : ''}`;
    }
    case 'ride':
      return `#/ride?${new URLSearchParams({ line: r.line, dir: String(r.dir), from: r.from, to: r.to })}`;
  }
}
