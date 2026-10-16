import { decodeTripUpdates, decodeVehiclePositions } from './pb';
import { filterDelays, filterPositions } from './filter';
import { prefilter } from './prefilter';

const ROUTES: Record<string, { url: string; build: (buf: Uint8Array) => unknown }> = {
  '/delays': { url: 'https://api.golemio.cz/v2/vehiclepositions/gtfsrt/trip_updates.pb', build: (b) => filterDelays(decodeTripUpdates(prefilter(b))) },
  '/positions': { url: 'https://api.golemio.cz/v2/vehiclepositions/gtfsrt/vehicle_positions.pb', build: (b) => filterPositions(decodeVehiclePositions(prefilter(b))) },
};
const TTL_MS = 15_000, STALE_MS = 120_000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

export function createHandler(deps: { fetchUpstream: (url: string, signal: AbortSignal) => Promise<Response>; now: () => number; timeoutMs?: number }) {
  const memo = new Map<string, { at: number; body: string }>();
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(req.url).pathname;
    const route = ROUTES[path];
    if (!route) return json({ error: 'not found' }, 404);
    let m = memo.get(path);
    let stale = false;
    if (!m || deps.now() - m.at >= TTL_MS) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 8_000);
      try {
        const up = await deps.fetchUpstream(route.url, ctrl.signal);
        if (!up.ok) throw new Error('upstream ' + up.status);
        const body = JSON.stringify(route.build(new Uint8Array(await up.arrayBuffer())));
        m = { at: deps.now(), body };
        memo.set(path, m);
      } catch (e) {
        if (!m || deps.now() - m.at > STALE_MS) return json({ error: String(e instanceof Error ? e.message : e) }, 503);
        stale = true;
      } finally {
        clearTimeout(timer);
      }
    }
    return new Response(m.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15', ...CORS, ...(stale ? { 'X-Stale': '1', 'Access-Control-Expose-Headers': 'X-Stale' } : {}) },
    });
  };
}

const handler = createHandler({ fetchUpstream: (url, signal) => fetch(url, { signal }), now: () => Date.now() });
export default { fetch: (req: Request) => handler(req) };
