import type * as maplibregl from 'maplibre-gl';

/**
 * Basemap curation for OpenFreeMap "liberty" (vector source 'openmaptiles', sprite ofm_f384).
 * Verified against the live style 2026-10-16: every layer id below exists; every POI class below
 * has a sprite icon of the same name (grocery, shop, pharmacy, post, school, college, hospital,
 * doctors, town_hall, railway, cafe, restaurant, fast_food, library, place_of_worship, bakery),
 * so icon-image is simply the feature's `class` (fallback 'shop'). Layers missing from a style are skipped.
 */
export const HIDE_LAYERS = [
  'building-3d', 'road_one_way_arrow', 'road_one_way_arrow_opposite',
  'highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us',
  'boundary_3', 'boundary_2', 'boundary_disputed',
  'aeroway_fill', 'aeroway_runway', 'aeroway_taxiway', 'natural_earth',
  'poi_r1', 'poi_r7', 'poi_r20',
];
export const POI_ESSENTIAL = ['grocery', 'shop', 'pharmacy', 'post', 'school', 'college', 'hospital', 'doctors', 'town_hall', 'railway'];
export const POI_DETAIL = ['cafe', 'restaurant', 'fast_food', 'library', 'place_of_worship', 'bakery'];
const SHOP_SUBCLASSES = ['supermarket', 'convenience'];

export interface PoiProps { class?: string; subclass?: string }

/** Pure mirror of poiFilter(): is this OpenMapTiles poi feature shown at this zoom? */
export function isCuratedPoi(p: PoiProps, zoom: number): boolean {
  const c = p.class;
  if (!c) return false;
  if (c === 'shop') return SHOP_SUBCLASSES.includes(p.subclass ?? '');
  if (c === 'post') return p.subclass === 'post_office'; // not parcel lockers / post boxes (hundreds of them)
  if (POI_ESSENTIAL.includes(c)) return true;
  return zoom >= 16 && POI_DETAIL.includes(c);
}

/** Filter expression. detail=false: the z14+ essentials; detail=true: the extra classes that appear from z16. */
export function poiFilter(detail = false): unknown[] {
  if (detail) return ['match', ['get', 'class'], POI_DETAIL, true, false];
  return ['any',
    ['match', ['get', 'class'], POI_ESSENTIAL.filter((c) => c !== 'shop' && c !== 'post'), true, false],
    ['all', ['==', ['get', 'class'], 'post'], ['==', ['get', 'subclass'], 'post_office']],
    ['all', ['==', ['get', 'class'], 'shop'], ['match', ['get', 'subclass'], SHOP_SUBCLASSES, true, false]],
  ];
}

/** i18n key for the popup category line. */
export function poiCategory(p: PoiProps): string {
  switch (p.class) {
    case 'grocery': case 'shop': return 'poiGrocery';
    case 'pharmacy': return 'poiPharmacy';
    case 'post': return 'poiPost';
    case 'school': case 'college': return 'poiSchool';
    case 'hospital': case 'doctors': return 'poiHealth';
    case 'town_hall': return 'poiTownHall';
    case 'railway': return 'poiRailway';
    case 'cafe': case 'restaurant': case 'fast_food': case 'bakery': return 'poiFood';
    case 'library': return 'poiLibrary';
    case 'place_of_worship': return 'poiWorship';
    default: return 'poiOther';
  }
}

const done = new WeakSet<object>();
const FONT = ['Noto Sans Regular'];

function scaleOpacity(map: maplibregl.Map, id: string, k: number, prop = 'fill-opacity') {
  const cur = map.getPaintProperty(id, prop as 'fill-opacity') as unknown;
  map.setPaintProperty(id, prop as 'fill-opacity', (typeof cur === 'number' ? cur * k : cur == null ? k : ['*', k, cur]) as never);
}

/** Idempotent per style instance (a fresh setStyle gets curated again); tolerant of missing layers / sources. */
export function declutter(map: maplibregl.Map): void {
  const style = (map as unknown as { style?: object }).style;
  if (style && done.has(style)) return;
  if (style) done.add(style);
  const has = (id: string) => !!map.getLayer(id);
  for (const id of HIDE_LAYERS) if (has(id)) map.setLayoutProperty(id, 'visibility', 'none');
  if (has('building')) {
    map.setPaintProperty('building', 'fill-opacity', 0.25);
    map.setPaintProperty('building', 'fill-outline-color', '#b9b4aa');
  }
  for (const id of ['landuse_residential', 'park', 'landcover_wood', 'landcover_grass', 'landcover_wetland', 'landcover_sand', 'landcover_ice']) if (has(id)) scaleOpacity(map, id, 0.5);
  if (has('highway-name-minor')) map.setLayerZoomRange('highway-name-minor', 16, 24);

  if (!map.getSource('openmaptiles') || has('places')) return;
  const before = has('lines-casing') ? 'lines-casing' : undefined;
  const base = {
    type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi',
    layout: {
      'icon-image': ['coalesce', ['image', ['get', 'class']], ['image', 'shop']],
      'icon-size': 1.1, 'icon-padding': 6, 'icon-allow-overlap': false,
      'symbol-sort-key': ['get', 'rank'],
      'text-field': ['step', ['zoom'], '', 16, ['get', 'name']],
      'text-font': FONT, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.8], 'text-optional': true, 'text-max-width': 7,
    },
    paint: { 'text-color': '#2b3640', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  };
  map.addLayer({ ...base, id: 'places', minzoom: 14, filter: poiFilter(false) } as never, before);
  map.addLayer({ ...base, id: 'places-detail', minzoom: 16, filter: poiFilter(true) } as never, before);
}
