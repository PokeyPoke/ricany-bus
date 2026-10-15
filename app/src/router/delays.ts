import { MIN_TRANSFER_SEC, type DelaysResponse, type TripDelay } from '@rb/shared';
import type { Itinerary } from './types';

export function delayAt(rec: TripDelay, seq: number): number {
  if (rec.stops[seq] != null) return rec.stops[seq];
  let bestSeq = -1;
  for (const k of Object.keys(rec.stops)) {
    const n = Number(k);
    if (n <= seq && n > bestSeq) bestSeq = n;
  }
  return bestSeq >= 0 ? rec.stops[bestSeq] : rec.delay;
}

export function tripDelay(d: DelaysResponse | null, tripId: string, serviceDate: string, seq: number): number | null {
  const r = d?.trips[tripId];
  if (!r || (r.startDate && r.startDate !== serviceDate)) return null;
  return delayAt(r, seq);
}

export interface LiveOverlay { boardDelay: (number | null)[]; alightDelay: (number | null)[]; transferRisk: boolean[] }

export function overlayDelays(it: Itinerary, d: DelaysResponse | null): LiveOverlay {
  const n = it.legs.length;
  const o: LiveOverlay = { boardDelay: Array(n).fill(null), alightDelay: Array(n).fill(null), transferRisk: Array(n).fill(false) };
  it.legs.forEach((l, i) => {
    if (l.kind !== 'bus') return;
    o.boardDelay[i] = tripDelay(d, l.tripId, l.serviceDate, l.boardSeq);
    o.alightDelay[i] = tripDelay(d, l.tripId, l.serviceDate, l.alightSeq);
  });
  for (let i = 0; i < n; i++) {
    const a = it.legs[i];
    if (a.kind !== 'bus') continue;
    let walk = 0;
    for (let j = i + 1; j < n; j++) {
      const b = it.legs[j];
      if (b.kind === 'walk') { walk += b.arrive - b.depart; continue; }
      if (b.kind === 'bus') {
        const ad = o.alightDelay[i] ?? 0, bd = o.boardDelay[j] ?? 0;
        const margin = b.depart + bd - (a.arrive + ad) - walk;
        o.transferRisk[j] = ad - bd > 0 && margin < MIN_TRANSFER_SEC;
      }
      break;
    }
  }
  return o;
}
