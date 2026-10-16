import { readable, writable } from 'svelte/store';
import { pragueNow, type FreeRouteId } from '@rb/shared';
import type { Itinerary, PlaceRef } from '../router/types';

export const bikesLayerOn = writable(true);
export const pickTarget = writable<'from' | 'to' | 'add' | null>(null);
export const mapPick = writable<{ lat: number; lon: number } | null>(null);
export const tripOverlay = writable<Itinerary | null>(null);
export const highlightLine = writable<FreeRouteId | null>(null);
export const focusPoints = writable<[number, number][] | null>(null);
export const userPos = writable<{ lat: number; lon: number } | null>(null);
export const planMarkers = writable<{ from?: PlaceRef; to?: PlaceRef }>({});
export const hoverGroup = writable<number | null>(null);
export const lineSelection = writable<{ number: string; directionId: number } | null>(null);
export const now = readable(pragueNow(), (set) => {
  // Svelte keeps the last value while unsubscribed, so refresh immediately on (re)subscribe
  // and whenever the tab becomes visible again.
  const tick = () => set(pragueNow());
  tick();
  const i = setInterval(tick, 30_000);
  const onVis = () => { if (document.visibilityState === 'visible') tick(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
  return () => {
    clearInterval(i);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
  };
});
