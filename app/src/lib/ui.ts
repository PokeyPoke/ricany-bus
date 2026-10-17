import { readable, writable } from 'svelte/store';
import { pragueNow, type FreeRouteId } from '@rb/shared';
import type { Itinerary, PlaceRef } from '../router/types';
import { load, save } from './storage';

/** Stored values are coerced to boolean; nothing is written until the user actually toggles (so a changed default still applies). */
export function persisted(key: string, fallback: boolean) {
  const raw = load<unknown>(key, fallback);
  const s = writable<boolean>(raw === true || raw === 'true' ? true : raw === false || raw === 'false' ? false : fallback);
  let first = true;
  s.subscribe((v) => { if (first) { first = false; return; } save(key, v); });
  return s;
}
export const bikesLayerOn = persisted('rb.layer.bikes', false);
export const poiLayerOn = persisted('rb.layer.poi', true);
export const buildingsLayerOn = persisted('rb.layer.buildings', true);
export const pickTarget = writable<'from' | 'to' | 'add' | null>(null);
export const mapPick = writable<{ lat: number; lon: number } | null>(null);
export const tripOverlay = writable<Itinerary | null>(null);
export const highlightLine = writable<FreeRouteId | null>(null);
export const focusPoints = writable<[number, number][] | null>(null);
export const userPos = writable<{ lat: number; lon: number } | null>(null);
export const planMarkers = writable<{ from?: PlaceRef; to?: PlaceRef }>({});
/** set by the new (sentence) version: what a tap on a stop in the map means there */
export const stopTap = writable<((groupId: string) => void) | null>(null);
export const hoverGroup = writable<number | null>(null);
/** `dir`: index into the line's directions (route variants included) */
export const lineSelection = writable<{ number: string; dir: number } | null>(null);
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
