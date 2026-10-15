import { writable } from 'svelte/store';
import { load, save } from './storage';
import type { PlaceRef } from '../router/types';

export interface SavedPlace { id: string; label: string; icon: string; lat: number; lon: number }

export const savedPlaces = writable<SavedPlace[]>(load<SavedPlace[]>('rb.places', []));
savedPlaces.subscribe((v) => save('rb.places', v));
export const recents = writable<PlaceRef[]>(load<PlaceRef[]>('rb.recents', []));
recents.subscribe((v) => save('rb.recents', v));

const same = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;

export function addPlace(p: Omit<SavedPlace, 'id'>): void {
  savedPlaces.update((l) => [...l, { ...p, id: Math.random().toString(36).slice(2, 10) }]);
}
export function removePlace(id: string): void {
  savedPlaces.update((l) => l.filter((p) => p.id !== id));
}
export function addRecent(to: PlaceRef): void {
  recents.update((l) => [{ lat: to.lat, lon: to.lon, name: to.name }, ...l.filter((x) => !same(x, to))].slice(0, 5));
}
