import { writable } from 'svelte/store';
import { load, save } from './storage';

/** what the map area shows: the street map, or the city's line diagram */
export type MapMode = 'map' | 'schema';
const saved = load<MapMode | null>('rb.mapMode', null);
export const mapMode = writable<MapMode>(saved === 'schema' ? 'schema' : 'map');
mapMode.subscribe((v) => save('rb.mapMode', v));
