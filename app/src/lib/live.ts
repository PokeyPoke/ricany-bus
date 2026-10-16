import { writable, type Writable } from 'svelte/store';
import { NEXTBIKE_CITY_UID, addDays, type DelaysResponse, type PositionsResponse, type Vehicle } from '@rb/shared';
import { NEXTBIKE_URL, WORKER_URL } from '../config';
import type { BikeStation } from '../router/types';
import type { Network } from '../router/network';

export const delays = writable<DelaysResponse | null>(null);
export const delaysOk = writable(true);
export const bikes = writable<BikeStation[] | null>(null);
export const bikesOk = writable(true);
export const bikesAt = writable<number | null>(null);

interface NbPlace { uid: number; name: string; lat: number; lng: number; spot?: boolean; maintenance?: boolean; active_place?: number; bikes?: number; bikes_available_to_rent?: number; free_racks?: number }
interface NbCity { uid: number; places?: NbPlace[] }

export function parseNextbike(json: unknown): BikeStation[] {
  const countries = (json as { countries?: { cities?: NbCity[] }[] })?.countries ?? [];
  const city = countries.flatMap((c) => c.cities ?? []).find((c) => c.uid === NEXTBIKE_CITY_UID);
  if (!city) throw new Error('Nextbike city 736 missing');
  return (city.places ?? [])
    .filter((p) => p.spot === true && !p.maintenance && p.active_place !== 0)
    .map((p) => ({ uid: p.uid, name: p.name, lat: p.lat, lon: p.lng, bikes: p.bikes_available_to_rent ?? p.bikes ?? 0, freeRacks: p.free_racks ?? 0 }));
}

async function fetchBikes(signal: AbortSignal): Promise<BikeStation[]> {
  const r = await fetch(NEXTBIKE_URL, { signal });
  if (!r.ok) throw new Error(`nextbike ${r.status}`);
  return parseNextbike(await r.json());
}
async function fetchDelays(signal: AbortSignal): Promise<DelaysResponse> {
  const r = await fetch(`${WORKER_URL}/delays`, { signal });
  if (!r.ok) throw new Error(`delays ${r.status}`);
  return (await r.json()) as DelaysResponse;
}

export function createPoller<T>(
  fetcher: (s: AbortSignal) => Promise<T>, ms: number, value: Writable<T | null>, ok: Writable<boolean>, onSuccess?: (at: number) => void,
): () => () => void {
  let refs = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ctrl: AbortController | null = null;
  async function tick() {
    ctrl?.abort();
    const c = (ctrl = new AbortController());
    try {
      const v = await fetcher(c.signal);
      if (c.signal.aborted) return;
      value.set(v);
      ok.set(true);
      onSuccess?.(Date.now());
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') ok.set(false);
    }
  }
  return () => {
    if (refs++ === 0) { void tick(); timer = setInterval(tick, ms); }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--refs === 0) { clearInterval(timer); ctrl?.abort(); }
    };
  };
}

export const useDelays = createPoller(fetchDelays, 30_000, delays, delaysOk);
export const useBikes = createPoller(fetchBikes, 60_000, bikes, bikesOk, (at) => bikesAt.set(at));

export function freshVehicles(r: PositionsResponse | null, nowMs: number, maxAgeMs = 180_000): Vehicle[] {
  return (r?.vehicles ?? []).filter((v) => v.ts * 1000 >= nowMs - maxAgeMs);
}

export function resolveVehicleTrip(v: Vehicle, netFor: (d: string) => Network): { net: Network; p: number; trip: number } | null {
  for (const d of [v.startDate, addDays(v.startDate, 1)]) {
    const net = netFor(d);
    for (let p = 0; p < net.patterns.length; p++) {
      const trip = net.patterns[p].trips.findIndex((t) => t.id === v.tripId && t.serviceDate === v.startDate);
      if (trip >= 0) return { net, p, trip };
    }
  }
  return null;
}
