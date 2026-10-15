import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse';

export type Row = Record<string, string>;
export interface GtfsSource { rows(file: string): AsyncIterable<Row> }

const parser = () => parse({ columns: true, bom: true, relax_quotes: true, skip_empty_lines: true });

async function* empty(): AsyncIterable<Row> {}

export function dirSource(dir: string): GtfsSource {
  return {
    rows(file) {
      const p = join(dir, file);
      if (!existsSync(p)) return empty();
      return createReadStream(p).pipe(parser());
    },
  };
}

/** Streams one member of a zip with the system `unzip` (present on macOS and ubuntu runners). */
export function zipSource(zipPath: string): GtfsSource {
  return {
    rows(file) {
      const child = spawn('unzip', ['-p', zipPath, file]);
      return child.stdout.pipe(parser());
    },
  };
}
