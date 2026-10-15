import { describe, it, expect } from 'vitest';
import { parseHash, formatRoute, type Route } from '../src/lib/hashRoute';

const rt = (r: Route) => expect(parseHash(formatRoute(r))).toEqual(r);

describe('hashRoute', () => {
  it('round-trips every route', () => {
    rt({ name: 'home' });
    rt({ name: 'plan', mode: 'arr', from: { lat: 49.991833, lon: 14.655608, name: 'Domů, u lesa' }, to: { lat: 50.0, lon: 14.66, name: 'Škola' }, date: '20261019', time: '07:45', sel: 'f1' });
    rt({ name: 'plan', mode: 'now', from: undefined, to: undefined, date: undefined, time: undefined, sel: undefined });
    rt({ name: 'stop', stopId: 'U9364Z11' });
    rt({ name: 'line', number: '91', dir: 1, stopId: 'U6790Z1' });
    rt({ name: 'bike', uid: 27581951 });
  });
  it('falls back to home or defaults on garbage', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/whatever')).toEqual({ name: 'home' });
    expect(parseHash('#/stop/')).toEqual({ name: 'home' });
    expect(parseHash('#/bike/abc')).toEqual({ name: 'home' });
    expect(parseHash('#/plan?mode=xyz&from=a,b,c')).toMatchObject({ name: 'plan', mode: 'now', from: undefined });
    expect(parseHash('#/line/3')).toEqual({ name: 'line', number: '3', dir: 0, stopId: undefined });
  });
  it('does not throw on malformed percent-encoding', () => {
    expect(parseHash('#/stop/%E0%A4%A')).toEqual({ name: 'home' });
  });
});
