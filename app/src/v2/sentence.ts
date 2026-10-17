import { haversine, secToHM } from '@rb/shared';
import type { Route } from '../lib/hashRoute';
import type { PlaceRef } from '../router/types';
import type { AppData } from '../lib/data';

/**
 * The new version shows every screen as one sentence: "Z [odkud] do [kam] · [kdy]".
 * These helpers read that sentence out of a route and turn an edited word back into a route,
 * so the classic screens (and their URLs) are reused unchanged underneath.
 */

export type When = { kind: 'now' } | { kind: 'dep' | 'arr'; date: string; time: string };

export function whenOf(r: Route): When {
  if (r.name === 'plan') return r.mode === 'now' || !r.date || !r.time ? { kind: 'now' } : { kind: r.mode, date: r.date, time: r.time };
  if ((r.name === 'home' || r.name === 'stop') && r.date && r.time) return { kind: 'dep', date: r.date, time: r.time };
  if (r.name === 'line' && r.date) return { kind: 'dep', date: r.date, time: '' };
  return { kind: 'now' };
}

/** the same screen at another moment (boards have no "arrive by": they show departures from that time) */
export function withWhen(r: Route, w: When): Route {
  const at = w.kind === 'now' ? { date: undefined, time: undefined } : { date: w.date, time: w.time || '0:00' };
  switch (r.name) {
    case 'plan':
      return w.kind === 'now' ? { ...r, mode: 'now', date: undefined, time: undefined, sel: undefined } : { ...r, mode: w.kind, date: w.date, time: w.time || '8:00', sel: undefined };
    case 'home':
    case 'stop':
      return { ...r, ...at };
    case 'line':
      return { ...r, date: w.kind === 'now' ? undefined : w.date };
    default:
      return r;
  }
}

/** keep the chosen moment when a screen links to another one (a line badge on a Saturday board opens Saturday's timetable) */
export function carryWhen(next: Route, cur: Route): Route {
  const w = whenOf(cur);
  if (w.kind === 'now') return next;
  if (whenOf(next).kind !== 'now') return next;
  if (next.name === 'plan' && w.kind === 'dep' && !w.time) return next;
  return withWhen(next, w);
}

export interface Word { label: string; me?: boolean }
export interface Sentence {
  /** what the panel answers: departures, a trip, a line, or a detail opened from one of them */
  kind: 'board' | 'trip' | 'line' | 'detail';
  from?: Word;
  to?: Word;
  line?: string;
  detail?: string;
}

const groupById = (data: AppData, id: string) => data.groups.find((g) => g.id === id) ?? null;
const groupOfStop = (data: AppData, stopId: string) => {
  const s = data.stops.find((x) => x.id === stopId);
  return s ? data.groups[s.group] ?? null : null;
};
const placeOf = (g: { lat: number; lon: number; name: string }): PlaceRef => ({ lat: g.lat, lon: g.lon, name: g.name });

/** the stop group a place stands for (a stop picked in search or on the map), if any */
export function groupOfPlace(data: AppData, p: PlaceRef) {
  return data.groups.find((g) => g.name === p.name && haversine(g.lat, g.lon, p.lat, p.lon) < 80) ?? null;
}

export function sentenceOf(r: Route, data: AppData, labels: { me: string; bus: string; bike: string; about: string }): Sentence {
  const me = { label: labels.me, me: true };
  const word = (p: PlaceRef | undefined): Word | undefined => (p ? { label: p.name, me: p.name === labels.me } : undefined);
  switch (r.name) {
    case 'home':
      return { kind: 'board', from: me };
    case 'stop':
      return { kind: 'board', from: { label: groupOfStop(data, r.stopId)?.name ?? r.stopId } };
    case 'plan':
      return { kind: 'trip', from: word(r.from) ?? me, to: word(r.to) };
    case 'line':
      return { kind: 'line', line: r.number };
    case 'from':
      return { kind: 'board', from: { label: groupById(data, r.groupId)?.name ?? r.groupId }, line: r.line };
    case 'ride':
      return { kind: 'trip', from: { label: groupById(data, r.from)?.name ?? r.from }, to: { label: groupById(data, r.to)?.name ?? r.to }, line: r.line };
    case 'bus':
      return { kind: 'detail', detail: labels.bus };
    case 'bike':
      return { kind: 'detail', detail: labels.bike };
    case 'about':
      return { kind: 'detail', detail: labels.about };
  }
}

/** where the sentence starts and ends as places (undefined = my location / not chosen) */
export function fromPlace(r: Route, data: AppData): PlaceRef | undefined {
  if (r.name === 'stop') { const g = groupOfStop(data, r.stopId); return g ? placeOf(g) : undefined; }
  if (r.name === 'plan') return r.from;
  if (r.name === 'from' || r.name === 'ride') { const g = groupById(data, r.name === 'from' ? r.groupId : r.from); return g ? placeOf(g) : undefined; }
  if (r.name === 'line' && r.stopId) { const g = groupOfStop(data, r.stopId); return g ? placeOf(g) : undefined; }
  return undefined;
}
export function toPlace(r: Route, data: AppData): PlaceRef | undefined {
  if (r.name === 'plan') return r.to;
  if (r.name === 'ride') { const g = groupById(data, r.to); return g ? placeOf(g) : undefined; }
  return undefined;
}

const planAt = (w: When) => (w.kind === 'now' ? { mode: 'now' as const } : { mode: w.kind, date: w.date, time: w.time || '8:00' });
const boardAt = (w: When) => (w.kind === 'now' ? {} : { date: w.date, time: w.time || '0:00' });

/** "Z [p]": a stop shows its departures, my location the ones nearby, any other place asks "kam?" */
export function setFrom(r: Route, data: AppData, p: PlaceRef | undefined, myLabel: string): Route {
  const w = whenOf(r), to = toPlace(r, data);
  const isMe = !p || p.name === myLabel;
  if (to) return { name: 'plan', from: isMe ? undefined : p, to, ...planAt(w) };
  if (isMe) return { name: 'home', ...boardAt(w) };
  const g = groupOfPlace(data, p);
  if (g) return { name: 'stop', stopId: g.id, ...boardAt(w) };
  return { name: 'plan', from: p, ...planAt(w) };
}

/** "do [p]": always a trip, from wherever the sentence starts */
export function setTo(r: Route, data: AppData, p: PlaceRef): Route {
  return { name: 'plan', from: fromPlace(r, data), to: p, ...planAt(whenOf(r)) };
}

export function clearTo(r: Route, data: AppData, myLabel: string): Route {
  const from = fromPlace(r, data);
  return setFrom({ name: 'home', ...boardAt(whenOf(r)) }, data, from, myLabel);
}

export function clearLine(r: Route, data: AppData, myLabel: string): Route {
  return setFrom({ name: 'home', ...boardAt(whenOf(r)) }, data, fromPlace(r, data), myLabel);
}

export function swap(r: Route, data: AppData): Route {
  const from = fromPlace(r, data), to = toPlace(r, data);
  if (!to) return r;
  return { name: 'plan', from: to, to: from, ...planAt(whenOf(r)) };
}

/** a stop tapped on the map: the destination when the sentence already starts at another stop, else the new start */
export function tapStop(r: Route, data: AppData, groupId: string, myLabel: string): Route {
  const g = groupById(data, groupId);
  if (!g) return r;
  const from = fromPlace(r, data), to = toPlace(r, data);
  const fromG = from ? groupOfPlace(data, from) : null;
  if (r.name !== 'line' && from && !to && fromG?.id !== g.id && from.name !== myLabel) return setTo(r, data, placeOf(g));
  return { name: 'stop', stopId: g.id, ...boardAt(whenOf(r)) };
}

/** label of the moment: "teď", "zítra 7:30", "so 24. 10. 8:00", "příjezd 8:00" */
export function whenLabel(w: When, today: string, tomorrow: string, words: { now: string; arrive: string; tomorrow: string }, lang: 'cs' | 'en'): string {
  if (w.kind === 'now') return words.now;
  const d = w.date === today ? '' : w.date === tomorrow ? words.tomorrow : new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(+w.date.slice(0, 4), +w.date.slice(4, 6) - 1, +w.date.slice(6, 8))));
  return [w.kind === 'arr' ? words.arrive : '', d, w.time].filter(Boolean).join(' ');
}

export const nowWhen = (date: string, sec: number): When => ({ kind: 'dep', date, time: secToHM(sec) });
