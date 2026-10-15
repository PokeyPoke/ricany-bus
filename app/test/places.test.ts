import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { addRecent, recents, addPlace, removePlace, savedPlaces } from '../src/lib/places';

describe('places', () => {
  it('recents dedupe by position and keep the 5 newest', () => {
    for (let i = 0; i < 7; i++) addRecent({ lat: 50 + i / 100, lon: 14.6, name: 'p' + i });
    addRecent({ lat: 50.03, lon: 14.6, name: 'again' });
    const r = get(recents);
    expect(r.length).toBe(5);
    expect(r[0].name).toBe('again');
    expect(r.filter((x) => Math.abs(x.lat - 50.03) < 1e-9).length).toBe(1);
  });
  it('adds and removes saved places', () => {
    addPlace({ label: 'Domů', icon: '🏠', lat: 49.99, lon: 14.65 });
    const p = get(savedPlaces)[0];
    expect(p).toMatchObject({ label: 'Domů', icon: '🏠' });
    removePlace(p.id);
    expect(get(savedPlaces)).toEqual([]);
  });
});
