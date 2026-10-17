/** Minimal OSM street download: Overpass first, then the main OSM API in small tiles. */

export interface OsmWay { id: number; nodes: number[]; tags: Record<string, string> }
export interface OsmData { nodes: Map<number, [number, number]>; ways: OsmWay[] }
/** minLon, minLat, maxLon, maxLat */
export type Bbox = readonly [number, number, number, number];

interface RawEl { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string> }

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const OSM_API = 'https://api.openstreetmap.org/api/0.6/map.json';
const UA = { 'User-Agent': 'ricany-bus street graph (https://github.com/PokeyPoke/ricany-bus)' };
const TILE_DEG = 0.02;

/** Adds the highway ways and their nodes from an OSM JSON element list into `into`. */
export function addElements(into: OsmData, elements: RawEl[], seenWays = new Set<number>()): void {
  for (const e of elements) {
    if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) into.nodes.set(e.id, [e.lat, e.lon]);
  }
  for (const e of elements) {
    if (e.type !== 'way' || !e.tags?.highway || !e.nodes || seenWays.has(e.id)) continue;
    seenWays.add(e.id);
    into.ways.push({ id: e.id, nodes: e.nodes, tags: e.tags });
  }
}

async function overpass(bbox: Bbox): Promise<OsmData> {
  const [w, s, e, n] = bbox;
  const q = `[out:json][timeout:120];way["highway"](${s},${w},${n},${e});(._;>;);out body;`;
  let last: unknown;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), headers: UA, signal: AbortSignal.timeout(180_000) });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      const out: OsmData = { nodes: new Map(), ways: [] };
      addElements(out, ((await r.json()) as { elements: RawEl[] }).elements);
      return out;
    } catch (err) {
      last = err;
      console.warn(`overpass failed: ${String(err)}`);
    }
  }
  throw last;
}

async function osmApiTiles(bbox: Bbox): Promise<OsmData> {
  const out: OsmData = { nodes: new Map(), ways: [] };
  const seen = new Set<number>();
  const [w, s, e, n] = bbox;
  for (let lat = s; lat < n - 1e-9; lat += TILE_DEG) {
    for (let lon = w; lon < e - 1e-9; lon += TILE_DEG) {
      const b = [lon, lat, Math.min(lon + TILE_DEG, e), Math.min(lat + TILE_DEG, n)].map((x) => x.toFixed(5)).join(',');
      let attempt = 0;
      for (;;) {
        try {
          const r = await fetch(`${OSM_API}?bbox=${b}`, { headers: UA, signal: AbortSignal.timeout(120_000) });
          if (!r.ok) throw new Error(`OSM API ${b}: HTTP ${r.status}`);
          addElements(out, ((await r.json()) as { elements: RawEl[] }).elements, seen);
          break;
        } catch (err) {
          if (++attempt >= 4) throw err;
          await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
        }
      }
    }
  }
  return out;
}

export async function fetchStreets(bbox: Bbox): Promise<OsmData> {
  try {
    return await overpass(bbox);
  } catch {
    console.warn('falling back to the OSM API in tiles');
    return osmApiTiles(bbox);
  }
}
