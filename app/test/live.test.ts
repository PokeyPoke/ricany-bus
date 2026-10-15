import { describe, it, expect, vi, afterEach } from 'vitest';
import { get, writable } from 'svelte/store';
import { parseNextbike, createPoller } from '../src/lib/live';

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
