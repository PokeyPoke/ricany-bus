import { describe, it, expect, vi, afterEach } from 'vitest';
import { HIDE_LAYERS, POI_ESSENTIAL, POI_DETAIL, isCuratedPoi, poiFilter, poiCategory } from '../src/map/basemap';

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; vi.resetModules(); });

/** tiny evaluator for the subset of expressions poiFilter emits */
function ev(e: unknown, p: Record<string, string | undefined>): unknown {
  if (!Array.isArray(e)) return e;
  const [op, ...a] = e as [string, ...unknown[]];
  switch (op) {
    case 'get': return p[a[0] as string];
    case 'literal': return a[0];
    case '==': return ev(a[0], p) === ev(a[1], p);
    case 'all': return a.every((x) => ev(x, p));
    case 'any': return a.some((x) => ev(x, p));
    case 'match': {
      const v = ev(a[0], p);
      const rest = a.slice(1);
      for (let i = 0; i + 1 < rest.length; i += 2) {
        const label = rest[i];
        if (Array.isArray(label) ? label.includes(v) : label === v) return rest[i + 1];
      }
      return rest[rest.length - 1];
    }
    default: throw new Error(`unsupported ${op}`);
  }
}

describe('basemap', () => {
  it('hides the listed clutter layers', () => {
    for (const id of ['building-3d', 'road_one_way_arrow', 'road_one_way_arrow_opposite', 'highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us', 'boundary_3', 'boundary_2', 'boundary_disputed', 'aeroway_fill', 'aeroway_runway', 'aeroway_taxiway', 'natural_earth', 'poi_r1', 'poi_r7', 'poi_r20']) expect(HIDE_LAYERS).toContain(id);
  });
  it('curated set', () => {
    expect(isCuratedPoi({ class: 'grocery' }, 14)).toBe(true);
    expect(isCuratedPoi({ class: 'shop', subclass: 'supermarket' }, 14)).toBe(true);
    expect(isCuratedPoi({ class: 'shop', subclass: 'convenience' }, 14)).toBe(true);
    expect(isCuratedPoi({ class: 'pharmacy' }, 14)).toBe(true);
    expect(isCuratedPoi({ class: 'post', subclass: 'post_office' }, 14)).toBe(true);
    expect(isCuratedPoi({ class: 'post', subclass: 'parcel_locker' }, 14)).toBe(false);
    expect(isCuratedPoi({ class: 'shop', subclass: 'clothes' }, 16)).toBe(false);
    expect(isCuratedPoi({ class: 'bench' }, 16)).toBe(false);
    expect(isCuratedPoi({}, 16)).toBe(false);
  });
  it('detail classes only from z16', () => {
    for (const c of POI_DETAIL) { expect(isCuratedPoi({ class: c }, 15)).toBe(false); expect(isCuratedPoi({ class: c }, 16)).toBe(true); }
    for (const c of POI_ESSENTIAL.filter((c) => c !== 'shop' && c !== 'post')) expect(isCuratedPoi({ class: c }, 14)).toBe(true);
  });
  it('poiFilter expressions agree with isCuratedPoi', () => {
    const feats = [{ class: 'grocery' }, { class: 'shop', subclass: 'supermarket' }, { class: 'shop', subclass: 'convenience' }, { class: 'pharmacy' }, { class: 'shop', subclass: 'clothes' }, { class: 'bench' }, { class: 'post', subclass: 'post_office' }, { class: 'post', subclass: 'post_box' }, { class: 'school' }, { class: 'cafe' }, { class: 'bakery', subclass: 'bakery' }];
    for (const f of feats) {
      expect(ev(poiFilter(false), f), JSON.stringify(f)).toBe(isCuratedPoi(f, 14));
      expect(ev(poiFilter(true), f), JSON.stringify(f)).toBe(isCuratedPoi(f, 16) && !isCuratedPoi(f, 14));
    }
  });
  it('has a Czech-facing category label key per class', () => {
    expect(poiCategory({ class: 'grocery' })).toBe('poiGrocery');
    expect(poiCategory({ class: 'shop', subclass: 'convenience' })).toBe('poiGrocery');
    expect(poiCategory({ class: 'unknown' })).toBe('poiOther');
  });
});

describe('layer toggles', () => {
  it('default: bikes off, places and buildings on', async () => {
    const ui = await import('../src/lib/ui');
    const { get } = await import('svelte/store');
    expect(get(ui.bikesLayerOn)).toBe(false);
    expect(get(ui.poiLayerOn)).toBe(true);
    expect(get(ui.buildingsLayerOn)).toBe(true);
  });
  it('persists choices', async () => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const ui = await import('../src/lib/ui');
    ui.bikesLayerOn.set(true);
    expect(m.get('rb.layer.bikes')).toBe('true');
    vi.resetModules();
    const ui2 = await import('../src/lib/ui');
    const { get } = await import('svelte/store');
    expect(get(ui2.bikesLayerOn)).toBe(true);
  });
});
