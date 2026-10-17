import { StreetGraph, type StopsFile, type StreetsFile, type TimetableFile } from '@rb/shared';
import { DATA_BASE } from '../config';
import { buildNetwork, type Network } from './network';
import { planTrip } from './plan';
import type { BikeStation, PlanRequest } from './types';

const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };

// Data is pushed by the page (single source of truth) -- the worker never fetches its own copy.
let data: { stops: StopsFile['stops']; tt: TimetableFile } | null = null;
let nets = new Map<string, Network>();

// The street graph has no indexes shared with stops/timetable, so the worker loads it itself (precached for offline).
// Without it — still downloading for longer than STREETS_WAIT_MS, or failed — plans use straight-line estimates.
const STREETS_WAIT_MS = 4000;
let streets: StreetGraph | null = null;
const streetsReady: Promise<void> = fetch(`${DATA_BASE}streets.json`)
  .then((r) => (r.ok ? (r.json() as Promise<StreetsFile>) : Promise.reject(new Error(`streets: HTTP ${r.status}`))))
  .then((f) => { streets = new StreetGraph(f); })
  .catch((e) => console.warn('street graph unavailable, using straight-line estimates', e));

type Msg =
  | { init: { stops: StopsFile['stops']; tt: TimetableFile } }
  | { id: number; req: PlanRequest; bikes: BikeStation[] | null };

scope.onmessage = async (e: MessageEvent<Msg>) => {
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
  if (!streets) await Promise.race([streetsReady, new Promise((r) => setTimeout(r, STREETS_WAIT_MS))]);
  try {
    const { stops, tt } = data;
    const ctx = {
      stops, streets,
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
