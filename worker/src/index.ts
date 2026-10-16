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

const BACKOFF_MS = 10_000;

export function createHandler(deps: { fetchUpstream: (url: string, signal: AbortSignal) => Promise<Response>; now: () => number; timeoutMs?: number }) {
  const memo = new Map<string, { at: number; body: string }>();
  const pending = new Map<string, Promise<void>>();
  const failedAt = new Map<string, { at: number; msg: string }>();

  async function refresh(path: string, url: string, build: (b: Uint8Array) => unknown): Promise<void> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 8_000);
    try {
      const up = await deps.fetchUpstream(url, ctrl.signal);
      if (!up.ok) throw new Error('upstream ' + up.status);
      const body = JSON.stringify(build(new Uint8Array(await up.arrayBuffer())));
      memo.set(path, { at: deps.now(), body });
      failedAt.delete(path);
    } catch (e) {
      failedAt.set(path, { at: deps.now(), msg: String(e instanceof Error ? e.message : e) });
    } finally {
      clearTimeout(timer);
      pending.delete(path);
    }
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(req.url).pathname;
    const route = ROUTES[path];
    if (!route) return json({ error: 'not found' }, 404);
    let m = memo.get(path);
    if (!m || deps.now() - m.at >= TTL_MS) {
      const f = failedAt.get(path);
      if (!(f && deps.now() - f.at < BACKOFF_MS)) {
        let p = pending.get(path);
        if (!p) { p = refresh(path, route.url, route.build); pending.set(path, p); }
        await p;
      }
      m = memo.get(path);
    }
    const fresh = m && deps.now() - m.at < TTL_MS;
    if (!m || (!fresh && deps.now() - m.at > STALE_MS)) {
      return json({ error: failedAt.get(path)?.msg ?? 'upstream unavailable' }, 503);
    }
    const stale = !fresh;
    return new Response(m.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15', ...CORS, ...(stale ? { 'X-Stale': '1', 'Access-Control-Expose-Headers': 'X-Stale' } : {}) },
    });
  };
}

const handler = createHandler({ fetchUpstream: (url, signal) => fetch(url, { signal }), now: () => Date.now() });
export default { fetch: (req: Request) => handler(req) };
