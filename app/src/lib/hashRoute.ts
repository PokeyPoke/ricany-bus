import type { PlaceRef } from '../router/types';
export type { PlaceRef };

export type PlanMode = 'now' | 'dep' | 'arr';
export type Route =
  | { name: 'home' }
  | { name: 'plan'; from?: PlaceRef; to?: PlaceRef; mode: PlanMode; date?: string; time?: string; sel?: string }
  | { name: 'stop'; stopId: string }
  | { name: 'line'; number: string; dir: number; stopId?: string }
  | { name: 'bike'; uid: number };

const encPlace = (p: PlaceRef) => `${+p.lat.toFixed(6)},${+p.lon.toFixed(6)},${p.name}`;
function decPlace(s: string | null): PlaceRef | undefined {
  if (!s) return undefined;
  const [lat, lon, ...rest] = s.split(',');
  const p = { lat: Number(lat), lon: Number(lon), name: rest.join(',') };
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && lat !== '' && lon !== '' ? p : undefined;
}
const opt = (v: string | null) => v ?? undefined;

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
      return parts[1] ? { name: 'stop', stopId: parts[1] } : { name: 'home' };
    case 'line':
      return parts[1] ? { name: 'line', number: parts[1], dir: Number(q.get('dir')) || 0, stopId: opt(q.get('stop')) } : { name: 'home' };
    case 'bike': {
      const uid = Number(parts[1]);
      return parts[1] && Number.isFinite(uid) ? { name: 'bike', uid } : { name: 'home' };
    }
    default:
      return { name: 'home' };
  }
}

export function formatRoute(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
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
      return `#/stop/${encodeURIComponent(r.stopId)}`;
    case 'line': {
      const q = new URLSearchParams({ dir: String(r.dir) });
      if (r.stopId) q.set('stop', r.stopId);
      return `#/line/${encodeURIComponent(r.number)}?${q}`;
    }
    case 'bike':
      return `#/bike/${r.uid}`;
  }
}
