import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StopRec } from '@rb/shared';
import { searchStops, searchPhoton, norm } from '../src/lib/geocode';

const s = (id: string, name: string, lat: number, lines: StopRec['lines']): StopRec => ({ id, name, platform: 'A', lat, lon: 14.65, lines, transfers: [], group: 0 });
const stops = [s('a', 'Masarykovo nám.', 49.99, ['L1731']), s('b', 'Masarykovo nám.', 49.992, ['L1733']), s('c', 'Sídl.Olivovna', 50.0, ['L1736']), s('d', 'Olivovna', 50.01, ['L1737'])];

afterEach(() => vi.unstubAllGlobals());

describe('searchStops', () => {
  it('is accent-insensitive, merges platforms, ranks prefix matches first', () => {
    expect(norm('Říčany')).toBe('ricany');
    const m = searchStops(stops, 'masaryk');
    expect(m).toEqual([{ name: 'Masarykovo nám.', detail: '1 · 3', lat: 49.991, lon: 14.65, kind: 'stop' }]);
    expect(searchStops(stops, 'olivovna').map((h) => h.name)).toEqual(['Olivovna', 'Sídl.Olivovna']);
    expect(searchStops(stops, 'o')).toEqual([]);
  });
});

describe('searchPhoton', () => {
  it('maps Photon features and restricts to the Říčany bbox', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ features: [
      { geometry: { coordinates: [14.655608, 49.9918333] }, properties: { name: 'Masarykovo náměstí', district: 'Radošovice', city: 'Říčany' } },
      { geometry: { coordinates: [14.66, 50.0] }, properties: { street: 'Olivova', housenumber: '12', city: 'Říčany' } },
    ] })));
    vi.stubGlobal('fetch', fetch);
    const r = await searchPhoton('masarykovo');
    expect(r).toEqual([
      { name: 'Masarykovo náměstí', detail: 'Radošovice', lat: 49.9918333, lon: 14.655608, kind: 'address' },
      { name: 'Olivova 12', detail: 'Říčany', lat: 50.0, lon: 14.66, kind: 'address' },
    ]);
    const url = String((fetch.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('bbox=14.58%2C49.95%2C14.74%2C50.03');
  });
  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502 })));
    await expect(searchPhoton('x')).rejects.toThrow('photon 502');
  });
});
