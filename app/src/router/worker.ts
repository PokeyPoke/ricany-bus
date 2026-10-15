import type { StopsFile, TimetableFile } from '@rb/shared';
import { buildNetwork, type Network } from './network';
import { planTrip } from './plan';
import type { BikeStation, PlanRequest } from './types';

const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };

// Data is pushed by the page (single source of truth) -- the worker never fetches its own copy.
let data: { stops: StopsFile['stops']; tt: TimetableFile } | null = null;
let nets = new Map<string, Network>();

type Msg =
  | { init: { stops: StopsFile['stops']; tt: TimetableFile } }
  | { id: number; req: PlanRequest; bikes: BikeStation[] | null };

scope.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if ('init' in m) {
    data = m.init;
    nets = new Map();
    return;
  }
  const { id, req, bikes } = m;
  if (!data) {
    scope.postMessage({ id, error: 'router worker not initialised' });
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
