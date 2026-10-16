import { describe, it, expect, vi, afterEach } from 'vitest';
import { get, writable } from 'svelte/store';
import { parseNextbike, createPoller, freshVehicles, resolveVehicleTrip } from '../src/lib/live';
import { buildNetwork } from '../src/router/network';
import { stops, timetable } from './fixtures/net';

const place = (o: Record<string, unknown>) => ({ uid: 1, name: 'A', lat: 49.99, lng: 14.65, spot: true, maintenance: false, active_place: 1, bikes: 3, bikes_available_to_rent: 3, free_racks: 7, ...o });

describe('parseNextbike', () => {
  it('parseNextbike filters unusable places and maps fields', () => {
    const json = { countries: [{ cities: [
      { uid: 999, places: [place({ uid: 50 })] },
      { uid: 736, places: [
        place({ uid: 1 }),
        place({ uid: 2, maintenance: true }),
        place({ uid: 3, spot: false }),
        place({ uid: 4, active_place: 0 }),
        place({ uid: 5, bikes_available_to_rent: 0, bikes: 2 }),
      ] },
    ] }] };
    expect(parseNextbike(json)).toEqual([
      { uid: 1, name: 'A', lat: 49.99, lon: 14.65, bikes: 3, freeRacks: 7 },
      { uid: 5, name: 'A', lat: 49.99, lon: 14.65, bikes: 0, freeRacks: 7 },
    ]);
  });
  it('throws when the Říčany city is missing', () => {
    expect(() => parseNextbike({ countries: [] })).toThrow();
  });
});

describe('createPoller', () => {
  afterEach(() => vi.useRealTimers());
  it('polls while acquired, ref-counts, and reports failures', async () => {
    vi.useFakeTimers();
    const value = writable<number | null>(null);
    const ok = writable(true);
    let n = 0;
    const fetcher = vi.fn(async () => ++n);
    const acquire = createPoller(fetcher, 1000, value, ok);
    const r1 = acquire();
    const r2 = acquire();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(value)).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    r1();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    r2();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(3);

    const bad = createPoller(async () => { throw new Error('down'); }, 1000, value, ok);
    const r3 = bad();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(ok)).toBe(false);
    r3();
  });
});

it('freshVehicles keeps vehicles and resolveVehicleTrip uses startDate', () => {
  const v = { id: 'x', label: '1', tripId: 'n1', routeId: 'L1736', startDate: '20261018', lat: 50, lon: 14.6, bearing: 90, speed: 3, stopSeq: 1, ts: 1000 } as const;
  expect(freshVehicles({ generatedAt: 1000, vehicles: [v] }, 1000_000 + 60_000)).toHaveLength(1);
  expect(freshVehicles({ generatedAt: 1000, vehicles: [v] }, 1000_000 + 200_000)).toHaveLength(0);
  const hit = resolveVehicleTrip(v, (d) => buildNetwork(stops, timetable, d));
  expect(hit && hit.net.patterns[hit.p].trips[hit.trip]).toMatchObject({ id: 'n1', serviceDate: '20261018' });
});

it('resolveVehicleTrip finds a previous-day trip via the next day network', () => {
  const v = { id: 'x', label: '1', tripId: 'n1', routeId: 'L1736', startDate: '20261018', lat: 50, lon: 14.6, bearing: null, speed: null, stopSeq: 1, ts: 1000 } as const;
  const netFor = (d: string) => (d === '20261018' ? { ...buildNetwork(stops, timetable, d), patterns: [] } : buildNetwork(stops, timetable, d));
  const hit = resolveVehicleTrip(v, netFor);
  expect(hit && hit.net.date).toBe('20261019');
  expect(hit && hit.net.patterns[hit.p].trips[hit.trip]).toMatchObject({ id: 'n1', serviceDate: '20261018' });
});
