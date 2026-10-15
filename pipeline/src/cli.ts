import { createWriteStream, mkdirSync, writeFileSync, statSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { pragueNow } from '@rb/shared';
import { zipSource } from './source';
import { extractFree } from './extract';
import { buildData } from './build';
import { validate } from './validate';

const FEED_URL = 'https://data.pid.cz/PID_GTFS.zip';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/public/data');

async function download(): Promise<string> {
  const file = join(mkdtempSync(join(tmpdir(), 'pid-')), 'PID_GTFS.zip');
  const res = await fetch(FEED_URL);
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
  return file;
}

async function main() {
  const zip = process.argv[2] ?? (await download());
  const today = pragueNow().date;
  const data = buildData(await extractFree(zipSource(zip)), today, new Date().toISOString());
  const errors = validate(data, today);
  if (errors.length) {
    console.error('Validation failed — keeping previous data:\n' + errors.map((e) => ` - ${e}`).join('\n'));
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  for (const [name, value] of Object.entries({ stops: data.stops, lines: data.lines, timetable: data.timetable, meta: data.meta })) {
    const p = join(OUT, `${name}.json`);
    writeFileSync(p, JSON.stringify(value));
    console.log(`${name}.json ${(statSync(p).size / 1024).toFixed(1)} KB`);
  }
  console.log(`OK: ${data.meta.tripCount} trips, ${data.stops.stops.length} stops, feed ${data.meta.feedStart}–${data.meta.feedEnd}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
