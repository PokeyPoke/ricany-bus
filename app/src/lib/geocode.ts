import { LINE_STYLE, RIC_BBOX, RIC_CENTER, type StopRec } from '@rb/shared';
import { PHOTON_URL } from '../config';
import type { PlaceRef } from '../router/types';

export interface PlaceHit extends PlaceRef { detail: string; kind: 'stop' | 'address' }

export const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function searchStops(stops: StopRec[], q: string, limit = 5): PlaceHit[] {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  const groups = new Map<string, StopRec[]>();
  for (const s of stops) {
    if (!norm(s.name).includes(n)) continue;
    const g = groups.get(s.name) ?? [];
    g.push(s);
    groups.set(s.name, g);
  }
  const rank = (name: string) => (norm(name).startsWith(n) ? 0 : 1);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'cs'))
    .slice(0, limit)
    .map(([name, g]) => ({
      name,
      detail: [...new Set(g.flatMap((s) => s.lines))].map((l) => LINE_STYLE[l].number).join(' · '),
      lat: +(g.reduce((a, s) => a + s.lat, 0) / g.length).toFixed(6),
      lon: +(g.reduce((a, s) => a + s.lon, 0) / g.length).toFixed(6),
      kind: 'stop' as const,
    }));
}

interface PhotonFeature { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }

export async function searchPhoton(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const u = new URL(PHOTON_URL);
  u.searchParams.set('q', q);
  u.searchParams.set('lat', String(RIC_CENTER.lat));
  u.searchParams.set('lon', String(RIC_CENTER.lon));
  u.searchParams.set('bbox', RIC_BBOX.join(','));
  u.searchParams.set('limit', '6');
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`photon ${r.status}`);
  const j = (await r.json()) as { features?: PhotonFeature[] };
  return (j.features ?? []).map((f) => {
    const p = f.properties;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const name = p.name || street || p.city || q;
    const detail = [p.name && street ? street : '', p.district || p.city || ''].filter(Boolean).join(', ');
    return { name, detail, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], kind: 'address' as const };
  });
}
