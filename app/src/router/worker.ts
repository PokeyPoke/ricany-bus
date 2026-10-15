import type { StopsFile, TimetableFile } from '@rb/shared';
import { buildNetwork, type Network } from './network';
import { planTrip } from './plan';
import type { BikeStation, PlanRequest } from './types';

const base = `${import.meta.env.BASE_URL}data/`;
const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };
let ready: Promise<{ stops: StopsFile['stops']; tt: TimetableFile }> | null = null;
const nets = new Map<string, Network>();

async function getJson<T>(name: string): Promise<T> {
  const r = await fetch(`${base}${name}`);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

function load() {
  ready ??= Promise.all([getJson<StopsFile>('stops.json'), getJson<TimetableFile>('timetable.json')]).then(([s, tt]) => ({ stops: s.stops, tt }));
  return ready;
}

scope.onmessage = async (e: MessageEvent<{ id: number; req: PlanRequest; bikes: BikeStation[] | null }>) => {
  const { id, req, bikes } = e.data;
  let data;
  try {
    data = await load();
  } catch (err) {
    ready = null;
    scope.postMessage({ id, error: String(err) });
    return;
  }
  try {
    const { stops, tt } = data;
    const ctx = {
      stops,
      netFor: (d: string) => {
        let n = nets.get(d);
        if (!n) { n = buildNetwork(stops, tt, d); nets.set(d, n); }
        return n;
      },
    };
    scope.postMessage({ id, result: planTrip(ctx, req, bikes) });
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};
