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
export const now = readable(pragueNow(), (set) => {
  const i = setInterval(() => set(pragueNow()), 30_000);
  return () => clearInterval(i);
});
