import { buildNetwork, type Network } from '../router/network';
import type { AppData } from './data';

const cache = new Map<string, Network>();
export function netFor(data: AppData, date: string): Network {
  let n = cache.get(date);
  if (!n) { n = buildNetwork(data.stops, data.timetable, date); cache.set(date, n); }
  return n;
}
