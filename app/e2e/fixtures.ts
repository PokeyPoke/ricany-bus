import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Stop = { id: string; name: string; lat: number; lon: number; lines: string[] };
type Line = { routeId: string; number: string; directions: { directionId: number; stops: number[] }[] };
const read = <T>(n: string): T => JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), 'utf8')) as T;

export const stops = read<{ stops: Stop[] }>('stops').stops;
export const lines = read<{ lines: Line[] }>('lines').lines;
const timetable = read<{ servicesByDate: Record<string, string[]>; patterns: { routeId: string; directionId: number; stops: number[]; seq: number[]; trips: { id: string; service: string; dep: number[] }[] }[] }>('timetable');
const services = timetable.servicesByDate;

const isWeekday = (d: string) => { const w = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay(); return w >= 1 && w <= 5; };
export const DATE = Object.keys(services).sort().find((d) => isWeekday(d) && services[d].length)!;

function pragueUtc(date: string, hh: number, mm: number): Date {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), hh, mm);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', hourCycle: 'h23' });
  for (const off of [1, 2]) {
    const d = new Date(guess - off * 3600_000);
    if (Number(fmt.format(d)) === hh) return d;
  }
  throw new Error('cannot resolve Prague offset');
}

export const CLOCK = pragueUtc(DATE, 7, 30);
const pat3 = timetable.patterns.find((p) => p.routeId === 'L1733' && p.directionId === 0 && p.trips.some((t) => services[DATE].includes(t.service) && t.dep[0] >= 7.5 * 3600))!;
export const BUS_TRIP = pat3.trips.find((t) => services[DATE].includes(t.service) && t.dep[0] >= 7.5 * 3600)!.id;
const busStop = stops[pat3.stops[0]];
export const BUS = { id: 'bus-1', label: '1', tripId: BUS_TRIP, routeId: 'L1733', startDate: DATE, lat: busStop.lat, lon: busStop.lon, bearing: 45, speed: 0, stopSeq: pat3.seq[0], ts: Math.floor(CLOCK.getTime() / 1000) };

const first = stops[lines[0].directions[0].stops[0]];
export const NEXTBIKE = { countries: [{ cities: [{ uid: 736, places: [
  { uid: 111, name: 'Test stanice', lat: first.lat + 0.0005, lng: first.lon, spot: true, maintenance: false, active_place: 1, bikes: 4, bikes_available_to_rent: 4, free_racks: 6 },
] }] }] };
const PHOTON = { features: [{ geometry: { coordinates: [14.6556, 49.9918] }, properties: { name: 'Testovací náměstí', city: 'Říčany' } }] };
const STYLE = { version: 8, glyphs: 'https://glyphs.invalid/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef2f5' } }] };

export const test = base.extend<{ mocks: void; delaysStatus: number }>({
  delaysStatus: [200, { option: true }],
  mocks: [async ({ page, delaysStatus }, use) => {
    await page.route('https://tiles.openfreemap.org/**', (r) => (r.request().url().includes('/styles/') ? r.fulfill({ json: STYLE }) : r.abort()));
    await page.route('https://glyphs.invalid/**', (r) => r.abort());
    await page.route('https://api.nextbike.net/**', (r) => r.fulfill({ json: NEXTBIKE }));
    await page.route('https://maps2.nextbike.net/**', (r) => r.fulfill({ json: NEXTBIKE }));
    await page.route('https://photon.komoot.io/**', (r) => r.fulfill({ json: PHOTON }));
    await page.route('https://ricany-bus-live.pokeypoke.workers.dev/**', (r) => {
      if (delaysStatus !== 200) return r.fulfill({ status: delaysStatus, json: { error: 'down' } });
      if (new URL(r.request().url()).pathname.endsWith('/positions')) return r.fulfill({ json: { generatedAt: BUS.ts, vehicles: [BUS] } });
      return r.fulfill({ json: { generatedAt: 1, trips: {} } });
    });
    await page.clock.setFixedTime(CLOCK);
    await use();
  }, { auto: true }],
});
export { expect };
export const place = (s: Stop) => `${s.lat},${s.lon},${encodeURIComponent(s.name)}`;
