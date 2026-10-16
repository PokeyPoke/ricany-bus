import type * as maplibregl from 'maplibre-gl';
import type { AppData } from '../lib/data';
import { linesGeoJson, groupsGeoJson, type FC } from './geojson';
import { drawRing, ringKey } from './rings';
import { drawBusIcon, drawArrow } from './busIcons';
import { LINE_ORDER } from '@rb/shared';

const empty: FC = { type: 'FeatureCollection', features: [] };
const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

export function addLayers(map: maplibregl.Map, data: AppData): void {
  map.addSource('lines', { type: 'geojson', data: linesGeoJson(data.lines) as never });
  map.addSource('groups', { type: 'geojson', data: groupsGeoJson(data.groups) as never, promoteId: 'gi', generateId: false } as never);
  map.addSource('line-stops', { type: 'geojson', data: empty as never, promoteId: 'gi', generateId: false } as never);
  for (const g of data.groups) {
    const key = ringKey(g.lines);
    if (!map.hasImage(key)) map.addImage(key, drawRing(g.lines), { pixelRatio: 2 });
  }
  map.addSource('bikes', { type: 'geojson', data: empty as never });
  map.addSource('trip', { type: 'geojson', data: empty as never });

  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  map.addLayer({ id: 'lines-casing', type: 'line', source: 'lines', layout: round, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'lines', type: 'line', source: 'lines', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.85 } });
  map.addLayer({ id: 'lines-hl', type: 'line', source: 'lines', layout: round, filter: ['==', ['get', 'routeId'], ''], paint: { 'line-color': ['get', 'color'], 'line-width': 8 } });

  map.addLayer({ id: 'trip-walk', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'walk'], paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1, 1.5] } });
  map.addLayer({ id: 'trip-bike', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'bike'], paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-dasharray': [2, 1] } });
  map.addLayer({ id: 'trip-bus', type: 'line', source: 'trip', layout: round, filter: ['==', ['get', 'kind'], 'bus'], paint: { 'line-color': ['get', 'color'], 'line-width': 8 } });

  const hover = ['boolean', ['feature-state', 'hover'], false] as maplibregl.ExpressionSpecification;
  map.addLayer({ id: 'groups-hit', type: 'circle', source: 'groups', paint: { 'circle-radius': 22, 'circle-opacity': 0 } });
  const size = (k: number) => ['interpolate', ['linear'], ['zoom'], 12, 0.5 * k, 16, 1 * k] as maplibregl.ExpressionSpecification;
  map.addLayer({ id: 'groups', type: 'symbol', source: 'groups', layout: { 'icon-image': ['get', 'ring'], 'icon-size': size(1), 'icon-allow-overlap': true } });
  // feature-state can't drive layout properties (icon-size), so the enlarged hover icon is its own layer filtered by gi
  map.addLayer({ id: 'groups-hover', type: 'symbol', source: 'groups', filter: ['==', ['get', 'gi'], -1], layout: { 'icon-image': ['get', 'ring'], 'icon-size': size(1.5), 'icon-allow-overlap': true } });
  map.addLayer({ id: 'groups-label', type: 'symbol', source: 'groups', minzoom: 14, layout: {
    'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-optional': true,
  }, paint: { 'text-color': '#1d2a3a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } });
  map.addLayer({ id: 'line-stops', type: 'circle', source: 'line-stops', layout: { visibility: 'none' }, paint: {
    'circle-radius': ['case', hover, 15, 11], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
  } });
  map.addLayer({ id: 'line-stops-num', type: 'symbol', source: 'line-stops', layout: {
    visibility: 'none', 'text-field': ['to-string', ['get', 'n']], 'text-font': FONT_BOLD, 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true,
  }, paint: { 'text-color': ['get', 'text'] } });

  map.addLayer({ id: 'bikes', type: 'circle', source: 'bikes', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 11],
    'circle-color': ['case', ['>', ['get', 'bikes'], 0], '#2e9d4a', '#8a96a3'],
    'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
  } });
  map.addLayer({ id: 'bikes-count', type: 'symbol', source: 'bikes', minzoom: 13, layout: {
    'text-field': ['to-string', ['get', 'bikes']], 'text-font': FONT_BOLD, 'text-size': 11, 'text-allow-overlap': true,
  }, paint: { 'text-color': '#ffffff' } });

  // live buses: above everything
  map.addSource('buses', { type: 'geojson', data: empty as never });
  for (const r of LINE_ORDER) if (!map.hasImage(`bus-${r}`)) map.addImage(`bus-${r}`, drawBusIcon(r));
  if (!map.hasImage('bus-arrow')) map.addImage('bus-arrow', drawArrow());
  map.addLayer({ id: 'buses-arrow', type: 'symbol', source: 'buses', filter: ['>=', ['get', 'bearing'], 0], layout: {
    'icon-image': 'bus-arrow', 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-offset': [0, -22], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
  } });
  map.addLayer({ id: 'buses', type: 'symbol', source: 'buses', layout: {
    'icon-image': ['concat', 'bus-', ['get', 'routeId']], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
  } });
}
