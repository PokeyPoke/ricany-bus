import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeAlerts } from '../src/pb';
import { filterAlerts } from '../src/filter';
import { prefilter } from '../src/prefilter';

const varint = (n: bigint) => { const out: number[] = []; let v = BigInt.asUintN(64, n); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return out; };
const tag = (f: number, wt: number) => varint(BigInt(f * 8 + wt));
const vi = (f: number, n: number) => [...tag(f, 0), ...varint(BigInt(n))];
const str = (f: number, s: string) => { const b = [...new TextEncoder().encode(s)]; return [...tag(f, 2), ...varint(BigInt(b.length)), ...b]; };
const msg = (f: number, body: number[]) => [...tag(f, 2), ...varint(BigInt(body.length)), ...body];
const tr = (f: number, texts: [string, string][]) => msg(f, texts.flatMap(([text, lang]) => msg(1, [...str(1, text), ...str(2, lang)])));
const alert = (id: string, routes: string[], header: [string, string][]) => msg(2, [
  ...str(1, id),
  ...msg(5, [
    ...msg(1, [...vi(1, 1_760_000_000), ...vi(2, 1_760_100_000)]),
    ...routes.flatMap((r) => msg(5, str(2, r))),
    ...tr(8, [['https://pid.cz/x', 'cs']]),
    ...tr(10, header),
    ...tr(11, [['Popis', 'cs'], ['Description', 'en']]),
  ]),
]);
const feed = (...entities: number[][]) => new Uint8Array([...msg(1, [...str(1, '2.0'), ...vi(3, 1_760_050_000)]), ...entities.flat()]);

describe('alerts', () => {
  it('keeps alerts naming a free line, Czech text first, English alongside', () => {
    const buf = feed(alert('a1', ['L1731', 'L364', 'L1731'], [['Výluka', 'cs'], ['Closure', 'en']]), alert('a2', ['L307'], [['Jinde', 'cs']]));
    const r = filterAlerts(decodeAlerts(buf));
    expect(r.generatedAt).toBe(1_760_050_000);
    expect(r.alerts).toEqual([{
      id: 'a1', routes: ['L1731'], header: 'Výluka', description: 'Popis', url: 'https://pid.cz/x',
      headerEn: 'Closure', descriptionEn: 'Description', periods: [[1_760_000_000, 1_760_100_000]],
    }]);
  });
  it('survives the prefilter and ignores the real feed of 2026-10-17 (no free-line alerts that day)', () => {
    const buf = feed(alert('a1', ['L1733'], [['Výluka', 'cs']]));
    expect(filterAlerts(decodeAlerts(prefilter(buf))).alerts.map((a) => a.id)).toEqual(['a1']);
    const real = new Uint8Array(readFileSync(new URL('./fixture/alerts.pb', import.meta.url)));
    const all = decodeAlerts(real);
    expect(all.alerts.length).toBeGreaterThan(0);
    expect(all.alerts.every((a) => a.header.cs || Object.keys(a.header).length)).toBe(true);
    expect(filterAlerts(decodeAlerts(prefilter(real))).alerts).toEqual([]);
  });
});
