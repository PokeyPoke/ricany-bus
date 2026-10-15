import type { StopsFile, TimetableFile } from '@rb/shared';
import { buildNetwork, type Network } from './network';
import { planTrip } from './plan';
import type { BikeStation, PlanRequest } from './types';

const base = `${import.meta.env.BASE_URL}data/`;
const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };
let ready: Promise<{ stops: StopsFile['stops']; tt: TimetableFile }> | null = null;
const nets = new Map<string, Network>();

function load() {
  ready ??= Promise.all([
    fetch(`${base}stops.json`).then((r) => r.json() as Promise<StopsFile>),
    fetch(`${base}timetable.json`).then((r) => r.json() as Promise<TimetableFile>),
  ]).then(([s, tt]) => ({ stops: s.stops, tt }));
  return ready;
}

scope.onmessage = async (e: MessageEvent<{ id: number; req: PlanRequest; bikes: BikeStation[] | null }>) => {
  const { id, req, bikes } = e.data;
  try {
    const { stops, tt } = await load();
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
    ready = null;
    scope.postMessage({ id, error: String(err) });
  }
};
