import { daysBetween } from '@rb/shared';
import type { Itinerary } from '../router/types';

/**
 * When to set off (seconds after `it.date` midnight): the first bus's live departure minus the legs before it.
 * Null for trips without a bus — walking or cycling can start any time.
 */
export function leaveAt(it: Itinerary, boardDelay: (number | null)[]): number | null {
  const b = it.legs.findIndex((l) => l.kind === 'bus');
  if (b < 0) return null;
  const before = it.legs.slice(0, b).reduce((s, l) => s + (l.arrive - l.depart), 0);
  return it.legs[b].depart + (boardDelay[b] ?? 0) - before;
}

/** Seconds from the Prague clock (`nowDate`, `nowSec`) until `sec` on the itinerary's date (negative = past). */
export const secondsUntil = (it: Itinerary, sec: number, nowDate: string, nowSec: number) =>
  daysBetween(nowDate, it.date) * 86400 + sec - nowSec;
