<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import * as maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { RIC_CENTER } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { MAP_STYLE } from '../config';
  import { bikes, bikesOk, useBikes } from '../lib/live';
  import { bikesLayerOn, pickTarget, mapPick, tripOverlay, highlightLine, focusPoints, userPos, planMarkers, hoverGroup, lineSelection } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { getLocation } from '../lib/geoloc';
  import { t } from '../lib/i18n';
  import { addLayers } from './layers';
  import { bikesGeoJson, tripGeoJson, lineStopsGeoJson, bbox, type FC } from './geojson';

  // maplibre 6 locates its worker via import.meta.url, which breaks under Vite's dep pre-bundling; point it at the emitted asset.
  maplibregl.setWorkerUrl(workerUrl);

  let { data }: { data: AppData } = $props();
  let el: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  /** bumped every time our layers are (re)added, so effects re-apply their state after a style swap */
  let gen = $state(0);
  let fellBack = $state(false);
  const FALLBACK_STYLE = { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef2f5' } }] } as maplibregl.StyleSpecification;
  const markers: Record<string, maplibregl.Marker | undefined> = {};

  const setData = (id: string, fc: FC) => (map?.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(fc as never);

  function marker(key: string, pos: { lat: number; lon: number } | undefined | null, cls: string, label = '') {
    markers[key]?.remove();
    markers[key] = undefined;
    if (!map || !pos) return;
    const e = document.createElement('div');
    e.className = `rb-marker ${cls}`;
    e.textContent = label;
    markers[key] = new maplibregl.Marker({ element: e }).setLngLat([pos.lon, pos.lat]).addTo(map);
  }

  function padding() {
    const mobile = window.innerWidth < 900;
    return mobile ? { top: 40, left: 40, right: 40, bottom: Math.round(window.innerHeight * 0.5) } : { top: 60, right: 60, bottom: 60, left: 460 };
  }

  function onClick(e: maplibregl.MapMouseEvent) {
    if (!map) return;
    if (get(pickTarget)) { mapPick.set({ lat: e.lngLat.lat, lon: e.lngLat.lng }); return; }
    const near = (r: number): [maplibregl.PointLike, maplibregl.PointLike] => [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
    const q = (id: string, box: maplibregl.PointLike | [maplibregl.PointLike, maplibregl.PointLike]) => (map!.getLayer(id) ? map!.queryRenderedFeatures(box, { layers: [id] }) : []);
    const nearest = (fs: maplibregl.MapGeoJSONFeature[]) => {
      const d = (f: maplibregl.MapGeoJSONFeature) => {
        const c = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        const pt = map!.project(c);
        return (pt.x - e.point.x) ** 2 + (pt.y - e.point.y) ** 2;
      };
      return fs.reduce<maplibregl.MapGeoJSONFeature | undefined>((best, f) => (!best || d(f) < d(best) ? f : best), undefined);
    };
    const p = (f: maplibregl.MapGeoJSONFeature) => f.properties as Record<string, string | number>;
    const bike = q('bikes', near(10))[0];
    if (bike) { navigate({ name: 'bike', uid: Number(p(bike).uid) }); return; }
    const ls = nearest(q('line-stops', near(22)));
    if (ls && map.getLayoutProperty('line-stops', 'visibility') === 'visible') {
      const d = p(ls);
      navigate({ name: 'line', number: String(d.number), dir: Number(d.directionId), stopId: data.stops[Number(d.stopIdx)].id }, true);
      return;
    }
    const g = nearest(q('groups-hit', near(22)));
    if (g) { navigate({ name: 'stop', stopId: data.groups[Number(p(g).gi)].id }); return; }
    const l = q('lines', near(10))[0];
    if (l) navigate({ name: 'line', number: String(p(l).number), dir: Number(p(l).directionId) || 0 });
  }

  async function locate() {
    try {
      const p = await getLocation();
      map?.flyTo({ center: [p.lon, p.lat], zoom: 15 });
    } catch { /* the planner shows location errors; the map button fails quietly */ }
  }

  onMount(() => {
    const m = new maplibregl.Map({ container: el, style: MAP_STYLE, center: [RIC_CENTER.lon, RIC_CENTER.lat], zoom: 13, attributionControl: { compact: true } });
    map = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    let styled = false;
    const fallBack = () => {
      if (styled || fellBack) return;
      fellBack = true;
      m.setStyle(FALLBACK_STYLE);
    };
    // style.load fires for the first style and again after the fallback swap; setStyle drops our sources/layers/images
    m.on('style.load', () => { styled = true; addLayers(m, data); gen++; });
    m.on('error', fallBack);
    const timer = setTimeout(fallBack, 8000);
    m.on('click', onClick);
    const hit = ['groups-hit', 'line-stops'];
    const canHover = matchMedia('(hover: hover)').matches;
    m.on('mousemove', (e) => {
      const cur = (id: string[]) => m.queryRenderedFeatures(e.point, { layers: id.filter((i) => m.getLayer(i)) });
      const h = cur(hit).filter((f) => f.layer.id !== 'line-stops' || m.getLayoutProperty('line-stops', 'visibility') === 'visible')[0];
      if (canHover) hoverGroup.set(h ? Number((h.properties as { gi: number }).gi) : null);
      m.getCanvas().style.cursor = get(pickTarget) ? 'crosshair' : h || cur(['bikes', 'lines']).length ? 'pointer' : '';
    });
    m.on('mouseout', () => hoverGroup.set(null));
    return () => { clearTimeout(timer); hoverGroup.set(null); m.remove(); map = null; };
  });

  let hovered: number | null = null;
  $effect(() => {
    const gi = $hoverGroup;
    if (!gen || !map) return;
    map.setFilter('groups-hover', ['==', ['get', 'gi'], gi ?? -1] as maplibregl.FilterSpecification);
    for (const src of ['groups', 'line-stops']) {
      if (hovered != null) map.setFeatureState({ source: src, id: hovered }, { hover: false });
      if (gi != null) map.setFeatureState({ source: src, id: gi }, { hover: true });
    }
    hovered = gi;
  });
  $effect(() => {
    const sel = $lineSelection;
    if (!gen || !map) return;
    const line = sel && data.lines.find((l) => l.number === sel.number);
    setData('line-stops', line && sel ? lineStopsGeoJson(data.groups, data.stops, line, sel.directionId) : { type: 'FeatureCollection', features: [] });
    for (const id of ['line-stops', 'line-stops-num']) map.setLayoutProperty(id, 'visibility', line ? 'visible' : 'none');
    for (const id of ['groups', 'groups-hover']) map.setPaintProperty(id, 'icon-opacity', line ? 0.4 : 1);
    map.setPaintProperty('groups-label', 'text-opacity', line ? 0.4 : 1);
  });
  $effect(() => { if ($bikesLayerOn) return useBikes(); });
  $effect(() => {
    if (!gen || !map) return;
    setData('bikes', bikesGeoJson($bikes ?? []));
    for (const id of ['bikes', 'bikes-count']) map.setLayoutProperty(id, 'visibility', $bikesLayerOn ? 'visible' : 'none');
  });
  $effect(() => {
    if (!gen || !map) return;
    // stale bike data: fade the markers
    const o = $bikesOk ? 1 : 0.35;
    map.setPaintProperty('bikes', 'circle-opacity', o);
    map.setPaintProperty('bikes', 'circle-stroke-opacity', o);
    map.setPaintProperty('bikes-count', 'text-opacity', o);
  });
  $effect(() => {
    if (!gen || !map) return;
    map.setFilter('lines-hl', ['==', ['get', 'routeId'], $highlightLine ?? ''] as maplibregl.FilterSpecification);
    const dim = !!($highlightLine || $tripOverlay);
    map.setPaintProperty('lines', 'line-opacity', dim ? 0.3 : 0.85);
    map.setPaintProperty('lines-casing', 'line-opacity', dim ? 0.3 : 0.9);
  });
  $effect(() => {
    if (!gen || !map) return;
    setData('trip', $tripOverlay ? tripGeoJson($tripOverlay, data) : { type: 'FeatureCollection', features: [] });
  });
  $effect(() => {
    if (!gen || !map) return;
    marker('from', $planMarkers.from, 'from', 'A');
    marker('to', $planMarkers.to, 'to', 'B');
  });
  $effect(() => { if (gen) marker('me', $userPos, 'me'); });
  $effect(() => {
    if (!gen || !map || !$focusPoints?.length) return;
    const b = bbox($focusPoints);
    if (!b) return;
    if ($focusPoints.length === 1) map.easeTo({ center: $focusPoints[0], zoom: Math.max(map.getZoom(), 15), padding: padding() });
    else map.fitBounds(b, { padding: padding(), maxZoom: 16, duration: 600 });
  });
</script>

<div class="map" bind:this={el}></div>
{#if fellBack}<div class="note" role="status">{$t('mapFallback')}</div>{/if}
<button class="locate" aria-label={$t('locate')} onclick={locate}>📍</button>

<style>
  .map { position: absolute; inset: 0; }
  .note { position: absolute; left: 10px; right: 64px; top: 10px; z-index: 4; background: var(--bg); padding: 6px 10px; border-radius: 8px; font-size: 0.8rem; box-shadow: var(--shadow); }
  .locate { position: absolute; right: 10px; top: 90px; z-index: 4; width: 44px; height: 44px; border-radius: 10px; background: var(--bg); box-shadow: var(--shadow); font-size: 1.2rem; }
  :global(.rb-marker) { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px; border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4); }
  :global(.rb-marker.from) { background: #1d7a35; }
  :global(.rb-marker.to) { background: #c62828; }
  :global(.rb-marker.me) { width: 18px; height: 18px; background: #1a73e8; }
</style>
