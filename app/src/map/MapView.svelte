<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import * as maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { RIC_CENTER } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { MAP_STYLE } from '../config';
  import { bikes, useBikes } from '../lib/live';
  import { bikesLayerOn, pickTarget, mapPick, tripOverlay, highlightLine, focusPoints, userPos, planMarkers } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { getLocation } from '../lib/geoloc';
  import { t } from '../lib/i18n';
  import { addLayers } from './layers';
  import { bikesGeoJson, tripGeoJson, bbox, type FC } from './geojson';

  // maplibre 6 locates its worker via import.meta.url, which breaks under Vite's dep pre-bundling; point it at the emitted asset.
  maplibregl.setWorkerUrl(workerUrl);

  let { data }: { data: AppData } = $props();
  let el: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let ready = $state(false);
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
    const layers = ['bikes', 'stops', 'lines'].filter((id) => map!.getLayer(id));
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
    const f = map.queryRenderedFeatures(box, { layers })[0];
    if (!f) return;
    const p = f.properties as Record<string, string | number>;
    if (f.layer.id === 'bikes') navigate({ name: 'bike', uid: Number(p.uid) });
    else if (f.layer.id === 'stops') navigate({ name: 'stop', stopId: String(p.id) });
    else navigate({ name: 'line', number: String(p.number), dir: Number(p.directionId) || 0 });
  }

  async function locate() {
    try {
      const p = await getLocation();
      map?.flyTo({ center: [p.lon, p.lat], zoom: 15 });
    } catch { /* the planner shows location errors; the map button fails quietly */ }
  }

  onMount(() => {
    map = new maplibregl.Map({ container: el, style: MAP_STYLE, center: [RIC_CENTER.lon, RIC_CENTER.lat], zoom: 13, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { addLayers(map!, data); ready = true; });
    map.on('click', onClick);
    map.on('mousemove', (e) => {
      const layers = ['bikes', 'stops', 'lines'].filter((id) => map!.getLayer(id));
      map!.getCanvas().style.cursor = get(pickTarget) ? 'crosshair' : map!.queryRenderedFeatures(e.point, { layers }).length ? 'pointer' : '';
    });
    return () => { map?.remove(); map = null; };
  });

  $effect(() => { if ($bikesLayerOn) return useBikes(); });
  $effect(() => {
    if (!ready || !map) return;
    setData('bikes', bikesGeoJson($bikes ?? []));
    for (const id of ['bikes', 'bikes-count']) map.setLayoutProperty(id, 'visibility', $bikesLayerOn ? 'visible' : 'none');
  });
  $effect(() => {
    if (!ready || !map) return;
    map.setFilter('lines-hl', ['==', ['get', 'routeId'], $highlightLine ?? ''] as maplibregl.FilterSpecification);
    const dim = !!($highlightLine || $tripOverlay);
    map.setPaintProperty('lines', 'line-opacity', dim ? 0.3 : 0.85);
    map.setPaintProperty('lines-casing', 'line-opacity', dim ? 0.3 : 0.9);
  });
  $effect(() => {
    if (!ready || !map) return;
    setData('trip', $tripOverlay ? tripGeoJson($tripOverlay, data) : { type: 'FeatureCollection', features: [] });
  });
  $effect(() => {
    if (!ready || !map) return;
    marker('from', $planMarkers.from, 'from', 'A');
    marker('to', $planMarkers.to, 'to', 'B');
  });
  $effect(() => { if (ready) marker('me', $userPos, 'me'); });
  $effect(() => {
    if (!ready || !map || !$focusPoints?.length) return;
    const b = bbox($focusPoints);
    if (!b) return;
    if ($focusPoints.length === 1) map.easeTo({ center: $focusPoints[0], zoom: Math.max(map.getZoom(), 15), padding: padding() });
    else map.fitBounds(b, { padding: padding(), maxZoom: 16, duration: 600 });
  });
</script>

<div class="map" bind:this={el}></div>
<button class="locate" aria-label={$t('locate')} onclick={locate}>📍</button>

<style>
  .map { position: absolute; inset: 0; }
  .locate { position: absolute; right: 10px; top: 90px; z-index: 4; width: 44px; height: 44px; border-radius: 10px; background: var(--bg); box-shadow: var(--shadow); font-size: 1.2rem; }
  :global(.rb-marker) { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px; border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4); }
  :global(.rb-marker.from) { background: #1d7a35; }
  :global(.rb-marker.to) { background: #c62828; }
  :global(.rb-marker.me) { width: 18px; height: 18px; background: #1a73e8; }
</style>
