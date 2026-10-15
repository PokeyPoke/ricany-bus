import type * as maplibregl from 'maplibre-gl';
import type { AppData } from '../lib/data';
import { linesGeoJson, stopsGeoJson, type FC } from './geojson';

const empty: FC = { type: 'FeatureCollection', features: [] };
const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

export function addLayers(map: maplibregl.Map, data: AppData): void {
  map.addSource('lines', { type: 'geojson', data: linesGeoJson(data.lines) as never });
  map.addSource('stops', { type: 'geojson', data: stopsGeoJson(data.stops) as never });
  map.addSource('bikes', { type: 'geojson', data: empty as never });
  map.addSource('trip', { type: 'geojson', data: empty as never });

  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  map.addLayer({ id: 'lines-casing', type: 'line', source: 'lines', layout: round, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'lines', type: 'line', source: 'lines', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.85 } });
  map.addLayer({ id: 'lines-hl', type: 'line', source: 'lines', layout: round, filter: ['==', ['get', 'routeId'], ''], paint: { 'line-color': ['get', 'color'], 'line-width': 8 } });

  map.addLayer({ id: 'trip-walk', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'walk'], paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1, 1.5] } });
  map.addLayer({ id: 'trip-bike', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'bike'], paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-dasharray': [2, 1] } });
  map.addLayer({ id: 'trip-bus', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'bus'], paint: { 'line-color': ['get', 'color'], 'line-width': 8 } });

  map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 8],
    'circle-color': '#ffffff', 'circle-stroke-color': '#1d2a3a', 'circle-stroke-width': 2,
  } });
  map.addLayer({ id: 'stops-label', type: 'symbol', source: 'stops', minzoom: 15, layout: {
    'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true,
  }, paint: { 'text-color': '#1d2a3a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } });

  map.addLayer({ id: 'bikes', type: 'circle', source: 'bikes', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 11],
    'circle-color': ['case', ['>', ['get', 'bikes'], 0], '#2e9d4a', '#8a96a3'],
    'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
  } });
  map.addLayer({ id: 'bikes-count', type: 'symbol', source: 'bikes', minzoom: 13, layout: {
    'text-field': ['to-string', ['get', 'bikes']], 'text-font': FONT_BOLD, 'text-size': 11, 'text-allow-overlap': true,
  }, paint: { 'text-color': '#ffffff' } });
}
