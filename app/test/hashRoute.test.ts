import { describe, it, expect } from 'vitest';
import { parseHash, formatRoute, type Route } from '../src/lib/hashRoute';

const rt = (r: Route) => expect(parseHash(formatRoute(r))).toEqual(r);

describe('hashRoute', () => {
  it('round-trips every route', () => {
    rt({ name: 'home' });
    rt({ name: 'home', date: '20261019', time: '7:30' });
    rt({ name: 'stop', stopId: 'U1Z1P', date: '20261024', time: '8:00' });
    rt({ name: 'line', number: '2', dir: 1, date: '20261024' });
    rt({ name: 'plan', mode: 'arr', from: { lat: 49.991833, lon: 14.655608, name: 'Domů, u lesa' }, to: { lat: 50.0, lon: 14.66, name: 'Škola' }, date: '20261019', time: '07:45', sel: 'f1' });
    rt({ name: 'plan', mode: 'now', from: undefined, to: undefined, date: undefined, time: undefined, sel: undefined });
    rt({ name: 'stop', stopId: 'U9364Z11' });
    rt({ name: 'line', number: '91', dir: 1, stopId: 'U6790Z1' });
    rt({ name: 'bike', uid: 27581951 });
    rt({ name: 'bus', tripId: 'L1731_12 3' });
    rt({ name: 'from', groupId: 'U9364Z11', line: '3', dir: 1 });
    rt({ name: 'from', groupId: 'U9364Z11', line: undefined, dir: undefined });
    rt({ name: 'ride', line: '91', dir: 0, from: 'U1Z1', to: 'U2Z2' });
    rt({ name: 'about' });
  });
  it('falls back to home or defaults on garbage', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/whatever')).toEqual({ name: 'home' });
    expect(parseHash('#/stop/')).toEqual({ name: 'home' });
    expect(parseHash('#/bike/abc')).toEqual({ name: 'home' });
    expect(parseHash('#/plan?mode=xyz&from=a,b,c')).toMatchObject({ name: 'plan', mode: 'now', from: undefined });
    expect(parseHash('#/line/3')).toEqual({ name: 'line', number: '3', dir: 0, stopId: undefined });
  });
  it('coerces line dir to a small non-negative index', () => {
    expect(parseHash('#/line/1?dir=3')).toMatchObject({ dir: 3 });
    expect(parseHash('#/line/3?dir=99')).toMatchObject({ dir: 0 });
    expect(parseHash('#/line/3?dir=1.5')).toMatchObject({ dir: 0 });
    expect(parseHash('#/line/3?dir=-1')).toMatchObject({ dir: 0 });
    expect(parseHash('#/line/3?dir=abc')).toMatchObject({ dir: 0 });
    expect(parseHash('#/line/3?dir=1')).toMatchObject({ dir: 1 });
  });
  it('garbage from/ride fall back', () => {
    expect(parseHash('#/from/')).toEqual({ name: 'home' });
    expect(parseHash('#/ride')).toEqual({ name: 'home' });
    expect(parseHash('#/ride?line=3&dir=0&from=a')).toEqual({ name: 'home' });
    expect(parseHash('#/from/U1?line=3')).toEqual({ name: 'from', groupId: 'U1', line: '3', dir: 0 });
  });
  it('from/ride edge cases', () => {
    expect(parseHash('#/from/U1?line=&dir=1')).toEqual({ name: 'from', groupId: 'U1', line: undefined, dir: undefined });
    expect(parseHash('#/from/U1?line=3&dir=99')).toEqual({ name: 'from', groupId: 'U1', line: '3', dir: 0 });
    expect(parseHash('#/ride?line=3&dir=-1&from=a&to=b')).toMatchObject({ dir: 0 });
    expect(parseHash('#/ride?line=&dir=0&from=a&to=b')).toEqual({ name: 'home' });
  });
  it('does not throw on malformed percent-encoding', () => {
    expect(parseHash('#/stop/%E0%A4%A')).toEqual({ name: 'home' });
  });
});
