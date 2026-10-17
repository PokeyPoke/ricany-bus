import type { FreeRouteId } from '@rb/shared';
import type { Leg } from '../router/types';

export type ChainItem = { kind: 'bus'; routeId: FreeRouteId } | { kind: 'walk' | 'bike'; min: number };

/** The one-line summary of a trip: bus badges and walk/bike minutes, with back-to-back walks merged into one. */
export function legChain(legs: Leg[]): ChainItem[] {
  const out: ChainItem[] = [];
  for (const l of legs) {
    if (l.kind === 'bus') { out.push({ kind: 'bus', routeId: l.routeId }); continue; }
    const sec = l.arrive - l.depart;
    const last = out[out.length - 1];
    if (l.kind === 'walk' && last?.kind === 'walk') { last.min += sec / 60; continue; }
    out.push({ kind: l.kind, min: sec / 60 });
  }
  return out.map((c) => (c.kind === 'bus' ? c : { ...c, min: Math.max(1, Math.round(c.min)) }));
}
