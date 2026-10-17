import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIC_BBOX, StreetGraph } from '@rb/shared';
import { fetchStreets, type OsmData } from './osm';
import { buildStreets } from './streets';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/public/data/streets.json');

async function main() {
  // optional argument: a saved {nodes: [id, [lat, lon]][], ways} dump instead of downloading
  const osm: OsmData = process.argv[2]
    ? (({ nodes, ways }) => ({ nodes: new Map(nodes), ways }))(JSON.parse(readFileSync(process.argv[2], 'utf8')))
    : await fetchStreets(RIC_BBOX);
  const file = buildStreets(osm, new Date().toISOString());
  const g = new StreetGraph(file);
  if (g.edgeCount < 1000) throw new Error(`street graph too small (${g.edgeCount} edges) — keeping previous data`);
  writeFileSync(OUT, JSON.stringify(file));
  console.log(`streets.json ${(statSync(OUT).size / 1024).toFixed(1)} KB: ${g.nodeCount} nodes, ${g.edgeCount} edges`);
}

main().catch((e) => { console.error(e); process.exit(1); });
