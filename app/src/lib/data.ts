import { daysBetween, type LineRec, type LinesFile, type MetaFile, type StopRec, type StopsFile, type TimetableFile } from '@rb/shared';
import { DATA_BASE } from '../config';

export interface AppData { stops: StopRec[]; lines: LineRec[]; timetable: TimetableFile; meta: MetaFile }

async function get<T>(name: string): Promise<T> {
  const r = await fetch(`${DATA_BASE}${name}.json`);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function loadData(): Promise<AppData> {
  const [s, l, timetable, meta] = await Promise.all([get<StopsFile>('stops'), get<LinesFile>('lines'), get<TimetableFile>('timetable'), get<MetaFile>('meta')]);
  return { stops: s.stops, lines: l.lines, timetable, meta };
}

export const daysLeft = (meta: MetaFile, today: string) => daysBetween(today, meta.feedEnd);
