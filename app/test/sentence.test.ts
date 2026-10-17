import { describe, it, expect } from 'vitest';
import type { AppData } from '../src/lib/data';
import { sentenceOf, setFrom, setTo, clearTo, clearLine, swap, tapStop, whenOf, withWhen, carryWhen, whenLabel } from '../src/v2/sentence';

const ME = 'Moje poloha';
const LABELS = { me: ME, bus: 'Autobus', bike: 'Nextbike', about: 'O aplikaci' };
const g = (id: string, name: string, lat: number, i: number) => ({ id, name, lat, lon: 14.66, platforms: [i], lines: ['L1731' as const] });
const data = {
  stops: [
    { id: 'A1', name: 'Masarykovo nám.', lat: 49.99, lon: 14.66, group: 0 },
    { id: 'B1', name: 'nádraží', lat: 49.995, lon: 14.66, group: 1 },
  ],
  groups: [g('A1', 'Masarykovo nám.', 49.99, 0), g('B1', 'nádraží', 49.995, 1)],
  lines: [], timetable: {}, meta: {},
} as unknown as AppData;
const A = { lat: 49.99, lon: 14.66, name: 'Masarykovo nám.' };
const B = { lat: 49.995, lon: 14.66, name: 'nádraží' };
const HOME = { lat: 50.0, lon: 14.7, name: 'Domů' };

describe('sentence', () => {
  it('reads every screen as one sentence', () => {
    expect(sentenceOf({ name: 'home' }, data, LABELS)).toEqual({ kind: 'board', from: { label: ME, me: true } });
    expect(sentenceOf({ name: 'stop', stopId: 'A1' }, data, LABELS)).toMatchObject({ kind: 'board', from: { label: 'Masarykovo nám.' } });
    expect(sentenceOf({ name: 'plan', mode: 'now', from: A, to: B }, data, LABELS)).toMatchObject({ kind: 'trip', from: { label: A.name }, to: { label: B.name } });
    expect(sentenceOf({ name: 'line', number: '2', dir: 0 }, data, LABELS)).toEqual({ kind: 'line', line: '2' });
    expect(sentenceOf({ name: 'bus', tripId: 'x' }, data, LABELS)).toEqual({ kind: 'detail', detail: 'Autobus' });
  });
  it('a stop as the start shows its board; another place asks where to; my location is home', () => {
    expect(setFrom({ name: 'home' }, data, A, ME)).toEqual({ name: 'stop', stopId: 'A1' });
    expect(setFrom({ name: 'home' }, data, HOME, ME)).toEqual({ name: 'plan', from: HOME, mode: 'now' });
    expect(setFrom({ name: 'stop', stopId: 'A1' }, data, { ...HOME, name: ME }, ME)).toEqual({ name: 'home' });
    // with a destination the start just changes
    expect(setFrom({ name: 'plan', mode: 'now', from: A, to: B }, data, HOME, ME)).toEqual({ name: 'plan', from: HOME, to: B, mode: 'now' });
  });
  it('a destination makes it a trip; clearing it goes back to the start board', () => {
    expect(setTo({ name: 'stop', stopId: 'A1' }, data, B)).toEqual({ name: 'plan', from: A, to: B, mode: 'now' });
    expect(setTo({ name: 'home' }, data, B)).toEqual({ name: 'plan', from: undefined, to: B, mode: 'now' });
    expect(clearTo({ name: 'plan', mode: 'now', from: A, to: B }, data, ME)).toEqual({ name: 'stop', stopId: 'A1' });
    expect(swap({ name: 'plan', mode: 'now', from: A, to: B }, data)).toEqual({ name: 'plan', from: B, to: A, mode: 'now' });
  });
  it('clearing a line returns to the stop it was opened at', () => {
    expect(clearLine({ name: 'line', number: '1', dir: 0, stopId: 'B1' }, data, ME)).toEqual({ name: 'stop', stopId: 'B1' });
    expect(clearLine({ name: 'line', number: '1', dir: 0 }, data, ME)).toEqual({ name: 'home' });
  });
  it('a stop tapped on the map is the destination after a start stop, else the new start', () => {
    expect(tapStop({ name: 'stop', stopId: 'A1' }, data, 'B1', ME)).toEqual({ name: 'plan', from: A, to: B, mode: 'now' });
    expect(tapStop({ name: 'home' }, data, 'B1', ME)).toEqual({ name: 'stop', stopId: 'B1' });
    expect(tapStop({ name: 'stop', stopId: 'A1' }, data, 'A1', ME)).toEqual({ name: 'stop', stopId: 'A1' });
  });
  it('when: one moment for every screen, kept across links', () => {
    const sat = { kind: 'dep' as const, date: '20261024', time: '8:00' };
    expect(withWhen({ name: 'stop', stopId: 'A1' }, sat)).toEqual({ name: 'stop', stopId: 'A1', date: '20261024', time: '8:00' });
    expect(whenOf(withWhen({ name: 'plan', mode: 'now', to: B }, sat))).toEqual(sat);
    expect(withWhen({ name: 'line', number: '2', dir: 0 }, sat)).toMatchObject({ date: '20261024' });
    expect(withWhen({ name: 'stop', stopId: 'A1', date: '20261024', time: '8:00' }, { kind: 'now' })).toEqual({ name: 'stop', stopId: 'A1', date: undefined, time: undefined });
    // a line badge on Saturday's board opens Saturday's timetable
    expect(carryWhen({ name: 'line', number: '2', dir: 0 }, { name: 'stop', stopId: 'A1', ...{ date: '20261024', time: '8:00' } })).toMatchObject({ date: '20261024' });
    expect(carryWhen({ name: 'line', number: '2', dir: 0 }, { name: 'stop', stopId: 'A1' })).toEqual({ name: 'line', number: '2', dir: 0 });
  });
  it('labels the moment briefly', () => {
    const words = { now: 'teď', arrive: 'příjezd', tomorrow: 'zítra' };
    expect(whenLabel({ kind: 'now' }, '20261017', '20261018', words, 'cs')).toBe('teď');
    expect(whenLabel({ kind: 'dep', date: '20261018', time: '7:30' }, '20261017', '20261018', words, 'cs')).toBe('zítra 7:30');
    expect(whenLabel({ kind: 'arr', date: '20261017', time: '18:00' }, '20261017', '20261018', words, 'cs')).toBe('příjezd 18:00');
  });
});
