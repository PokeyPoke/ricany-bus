import { decodeTripUpdates } from './pb';
import { filterDelays } from './filter';

const UPSTREAM = 'https://api.golemio.cz/v2/vehiclepositions/gtfsrt/trip_updates.pb';
const TTL_MS = 15_000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

export function createHandler(deps: { fetchUpstream: () => Promise<Response>; now: () => number }) {
  let memo: { at: number; body: string } | null = null;
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (new URL(req.url).pathname !== '/delays') return json({ error: 'not found' }, 404);
    if (!memo || deps.now() - memo.at >= TTL_MS) {
      try {
        const up = await deps.fetchUpstream();
        if (!up.ok) throw new Error('upstream ' + up.status);
        const body = JSON.stringify(filterDelays(decodeTripUpdates(new Uint8Array(await up.arrayBuffer()))));
        memo = { at: deps.now(), body };
      } catch (e) {
        return json({ error: String(e instanceof Error ? e.message : e) }, 503);
      }
    }
    return new Response(memo.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15', ...CORS },
    });
  };
}

const handler = createHandler({ fetchUpstream: () => fetch(UPSTREAM), now: () => Date.now() });
export default { fetch: (req: Request) => handler(req) };
