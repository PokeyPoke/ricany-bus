import type * as maplibregl from 'maplibre-gl';
import type { AppData } from '../lib/data';
import { linesGeoJson, parallelLinesGeoJson, groupsGeoJson, type FC } from './geojson';
import { drawRing, ringKey } from './rings';
import { drawBusIcon, drawArrow } from './busIcons';
import { LINE_ORDER, LINE_STYLE } from '@rb/shared';

const empty: FC = { type: 'FeatureCollection', features: [] };
const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

/** `dark`: colours for the dark basemap (casings and halos in the map's own dark tone instead of white) */
/** Bus icon size by zoom: smaller across the whole town, full size at street level (mirrors BUS_SIZE). */
export function busScale(zoom: number): number {
  return zoom <= 12 ? 0.6 : zoom >= 15 ? 1 : 0.6 + ((zoom - 12) / 3) * 0.4;
}
const BUS_SIZE = ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 1] as maplibregl.ExpressionSpecification;

export function addLayers(map: maplibregl.Map, data: AppData, dark = false): void {
  const halo = dark ? '#151c24' : '#ffffff';
  // side by side where lines share a road; the highlight uses the true (un-offset) routes on top
  map.addSource('lines', { type: 'geojson', data: parallelLinesGeoJson(data.lines) as never });
  map.addSource('lines-full', { type: 'geojson', data: linesGeoJson(data.lines) as never });
  map.addSource('groups', { type: 'geojson', data: groupsGeoJson(data.groups) as never, promoteId: 'gi', generateId: false } as never);
  map.addSource('line-stops', { type: 'geojson', data: empty as never, promoteId: 'gi', generateId: false } as never);
  for (const g of data.groups) {
    const key = ringKey(g.lines);
    if (!map.hasImage(key)) map.addImage(key, drawRing(g.lines), { pixelRatio: 2 });
  }
  map.addSource('bikes', { type: 'geojson', data: empty as never });
  map.addSource('trip', { type: 'geojson', data: empty as never });

  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  // one line width per slot, so lines sharing a road just touch at every zoom
  const width = ['interpolate', ['linear'], ['zoom'], 12, 2.5, 14, 4, 17, 6];
  const offset = ['interpolate', ['linear'], ['zoom'], 12, ['*', ['get', 'off'], 2.5], 14, ['*', ['get', 'off'], 4], 17, ['*', ['get', 'off'], 6]];
  const casing = ['interpolate', ['linear'], ['zoom'], 12, 4.5, 14, 6.5, 17, 9];
  map.addLayer({ id: 'lines-casing', type: 'line', source: 'lines', layout: round, paint: { 'line-color': halo, 'line-width': casing, 'line-offset': offset, 'line-opacity': 0.9 } as never });
  map.addLayer({ id: 'lines', type: 'line', source: 'lines', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': width, 'line-offset': offset, 'line-opacity': 0.9 } as never });
  map.addLayer({ id: 'lines-hl-casing', type: 'line', source: 'lines-full', layout: round, filter: ['==', ['get', 'routeId'], ''], paint: { 'line-color': halo, 'line-width': 11 } });
  map.addLayer({ id: 'lines-hl', type: 'line', source: 'lines-full', layout: round, filter: ['==', ['get', 'routeId'], ''], paint: { 'line-color': ['get', 'color'], 'line-width': 7 } });

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
  }, paint: { 'text-color': dark ? '#e8edf2' : '#1d2a3a', 'text-halo-color': halo, 'text-halo-width': 2 } });
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
  map.addSource('buses-leader', { type: 'geojson', data: empty as never });
  // pulse ring centres: the true positions displaced by the same pixel offset as the fanned-out icons
  map.addSource('buses-pulse', { type: 'geojson', data: empty as never });
  for (const r of LINE_ORDER) {
    if (!map.hasImage(`bus-${r}`)) map.addImage(`bus-${r}`, drawBusIcon(r), { pixelRatio: 2 });
    if (!map.hasImage(`bus-arrow-${r}`)) map.addImage(`bus-arrow-${r}`, drawArrow(LINE_STYLE[r].color), { pixelRatio: 2 });
  }
  // thin leader from the true position to a fanned-out icon, with a dot marking the true position
  map.addLayer({ id: 'buses-leader', type: 'line', source: 'buses-leader', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#1d2a3a', 'line-width': 2, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'buses-anchor', type: 'circle', source: 'buses', filter: ['>', ['get', 'disp'], 0], paint: { 'circle-radius': 4, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'buses-pulse', type: 'circle', source: 'buses-pulse', filter: ['in', ['get', 'tripId'], ['literal', []]], paint: { 'circle-radius': 20, 'circle-color': ['get', 'color'], 'circle-opacity': 0.5, 'circle-pitch-alignment': 'map' } });
  map.addLayer({ id: 'buses-arrow', type: 'symbol', source: 'buses', filter: ['>=', ['get', 'bearing'], 0], layout: {
    'icon-image': ['concat', 'bus-arrow-', ['get', 'routeId']], 'icon-size': BUS_SIZE, 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-offset': ['get', 'aoff'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
  }, paint: { 'icon-opacity': ['case', ['==', ['get', 'waiting'], 1], 0.45, 1] } });
  map.addLayer({ id: 'buses', type: 'symbol', source: 'buses', layout: {
    'icon-image': ['concat', 'bus-', ['get', 'routeId']], 'icon-size': BUS_SIZE, 'icon-offset': ['get', 'off'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
  }, paint: { 'icon-opacity': ['case', ['==', ['get', 'waiting'], 1], 0.45, 1] } });
}
