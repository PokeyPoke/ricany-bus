<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import * as maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { RIC_CENTER, LINE_STYLE, type Vehicle } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { MAP_STYLE } from '../config';
  import { bikes, bikesOk, useBikes, positions, usePositions, freshVehicles } from '../lib/live';
  import { bikesLayerOn, poiLayerOn, buildingsLayerOn, pickTarget, mapPick, tripOverlay, highlightLine, focusPoints, userPos, planMarkers, hoverGroup, lineSelection, now } from '../lib/ui';
  import { navigate, route } from '../lib/nav';
  import { getLocation } from '../lib/geoloc';
  import { t } from '../lib/i18n';
  import { addLayers } from './layers';
  import { declutter, poiCategory } from './basemap';
  import LayersPanel from '../components/LayersPanel.svelte';
  import { bikesGeoJson, busesGeoJson, tripGeoJson, lineStopsGeoJson, bbox, type FC } from './geojson';
  import { spreadOffsets } from './spread';

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
    // buses: hit-test in screen space against the (possibly fanned-out) icon rectangles, nearest centre wins
    const bus = busHit(e.point.x, e.point.y);
    if (bus) { navigate({ name: 'bus', tripId: bus }); return; }
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
    const place = nearest(q('places', near(18)).concat(q('places-detail', near(18))));
    if (place) { showPlace(place); return; }
    const l = q('lines', near(10))[0];
    if (l) navigate({ name: 'line', number: String(p(l).number), dir: Number(p(l).directionId) || 0 });
  }

  /** screen-space icon centres of the live buses as last drawn: tripId -> [x, y] */
  let busCentres: { tripId: string; x: number; y: number }[] = [];
  function busHit(px: number, py: number): string | null {
    let best: string | null = null, bd = Infinity;
    for (const b of busCentres) {
      const dx = Math.abs(b.x - px), dy = Math.abs(b.y - py);
      if (dx > 24 + 6 || dy > 27 + 6) continue; // icon is 48x54 plus a little finger slack
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = b.tripId; }
    }
    return best;
  }

  let lastVehicles: Vehicle[] = [];
  /** project, fan out overlapping buses, push to the buses + leader sources */
  function refreshBuses(vehicles: Vehicle[] = lastVehicles) {
    lastVehicles = vehicles;
    const m = map;
    if (!m || !m.getSource('buses')) return;
    const proj = vehicles.map((v) => ({ v, pt: m.project([v.lon, v.lat]) }));
    const offs = spreadOffsets(proj.map(({ v, pt }) => ({ id: v.tripId, x: pt.x, y: pt.y })), 46, 40);
    busCentres = proj.map(({ v, pt }) => { const o = offs[v.tripId] ?? [0, 0]; return { tripId: v.tripId, x: pt.x + o[0], y: pt.y + o[1] }; });
    setData('buses', busesGeoJson(vehicles, offs, m.getBearing()));
    setData('buses-pulse', {
      type: 'FeatureCollection',
      features: proj.map(({ v, pt }) => {
        const o = offs[v.tripId] ?? [0, 0];
        const at = o[0] || o[1] ? m.unproject([pt.x + o[0], pt.y + o[1]]) : null;
        return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: (at ? [at.lng, at.lat] : [v.lon, v.lat]) as [number, number] }, properties: { tripId: v.tripId, color: LINE_STYLE[v.routeId].color } };
      }),
    });
    setData('buses-leader', {
      type: 'FeatureCollection',
      features: proj.filter(({ v }) => { const o = offs[v.tripId]; return o && (o[0] || o[1]); }).map(({ v, pt }) => {
        const o = offs[v.tripId];
        const to = m.unproject([pt.x + o[0], pt.y + o[1]]);
        return { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [[v.lon, v.lat], [to.lng, to.lat]] as [number, number][] }, properties: {} };
      }),
    });
  }

  let popup: maplibregl.Popup | null = null;
  function showPlace(f: maplibregl.MapGeoJSONFeature) {
    const props = f.properties as { name?: string; class?: string; subclass?: string };
    const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
    const category = get(t)(poiCategory(props) as never);
    const name = props.name || category;
    const box = document.createElement('div');
    box.className = 'rb-place';
    const h = document.createElement('strong'); h.textContent = name;
    const c = document.createElement('div'); c.className = 'cat'; c.textContent = category;
    const b = document.createElement('button'); b.className = 'go'; b.textContent = get(t)('goHere');
    box.append(h, c, b);
    popup?.remove();
    const pp = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: '240px' }).setLngLat([lon, lat]).setDOMContent(box).addTo(map!);
    popup = pp;
    b.onclick = () => { pp.remove(); navigate({ name: 'plan', mode: 'now', to: { lat, lon, name } }); };
  }

  let firstRoute = true;
  $effect(() => {
    void $route; // any route change closes the place popup
    if (firstRoute) { firstRoute = false; return; }
    untrack(() => { popup?.remove(); popup = null; });
  });

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
    let styled = false, warned = false;
    const fallBack = () => {
      if (styled || fellBack) return;
      fellBack = true;
      m.setStyle(FALLBACK_STYLE);
    };
    // style.load fires for the first style and again after the fallback swap; setStyle drops our sources/layers/images
    m.on('style.load', () => {
      styled = true;
      const warn = (what: string, err: unknown) => { if (!warned) { warned = true; console.warn(`${what} failed`, err); } };
      try { addLayers(m, data); } catch (err) { warn('map layer setup', err); }
      try { declutter(m); } catch (err) { warn('basemap declutter', err); }
      gen++;
    });
    m.on('moveend', () => refreshBuses());
    m.on('error', fallBack);
    const timer = setTimeout(fallBack, 8000);
    m.on('click', onClick);
    const hit = ['groups-hit', 'line-stops'];
    const canHover = matchMedia('(hover: hover)').matches;
    m.on('mousemove', (e) => {
      const cur = (id: string[]) => m.queryRenderedFeatures(e.point, { layers: id.filter((i) => m.getLayer(i)) });
      const h = cur(hit).filter((f) => f.layer.id !== 'line-stops' || m.getLayoutProperty('line-stops', 'visibility') === 'visible')[0];
      if (canHover) hoverGroup.set(h ? Number((h.properties as { gi: number }).gi) : null);
      m.getCanvas().style.cursor = get(pickTarget) ? 'crosshair' : h || busHit(e.point.x, e.point.y) || cur(['bikes', 'places', 'places-detail', 'lines']).length ? 'pointer' : '';
    });
    m.on('mouseout', () => hoverGroup.set(null));
    return () => { clearTimeout(timer); popup?.remove(); hoverGroup.set(null); m.remove(); map = null; };
  });

  let hovered: number | null = null;
  $effect(() => {
    const gi = $hoverGroup;
    if (!gen || !map) return;
    if (map.getLayer('groups-hover')) map.setFilter('groups-hover', ['==', ['get', 'gi'], gi ?? -1] as maplibregl.FilterSpecification);
    for (const src of ['groups', 'line-stops']) {
      if (!map.getSource(src)) continue;
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
    for (const id of ['line-stops', 'line-stops-num']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', line ? 'visible' : 'none');
    for (const id of ['groups', 'groups-hover']) if (map.getLayer(id)) map.setPaintProperty(id, 'icon-opacity', line ? 0.4 : 1);
    if (map.getLayer('groups-label')) map.setPaintProperty('groups-label', 'text-opacity', line ? 0.4 : 1);
  });
  $effect(() => usePositions());
  $effect(() => {
    if (!gen || !map) return;
    void $now; // re-filter stale vehicles on every clock tick
    refreshBuses(freshVehicles($positions, Date.now()));
  });
  $effect(() => { if ($bikesLayerOn) return useBikes(); });
  $effect(() => {
    if (!gen || !map) return;
    setData('bikes', bikesGeoJson($bikes ?? []));
    for (const id of ['bikes', 'bikes-count']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', $bikesLayerOn ? 'visible' : 'none');
  });
  $effect(() => {
    if (!gen || !map) return;
    const v = $poiLayerOn ? 'visible' : 'none';
    for (const id of ['places', 'places-detail']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v);
    if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', $buildingsLayerOn ? 'visible' : 'none');
  });
  // live buses of the open trip pulse; a cheap paint tick (6 fps) keyed on the overlay's trip ids only (positions polls don't restart it)
  const pulseKey = $derived(($tripOverlay?.legs ?? []).flatMap((l) => (l.kind === 'bus' ? [l.tripId] : [])).join(','));
  $effect(() => {
    const key = pulseKey;
    if (!gen || !map || !map.getLayer('buses-pulse')) return;
    const m = map;
    const ids = key ? key.split(',') : [];
    m.setFilter('buses-pulse', ['in', ['get', 'tripId'], ['literal', ids]] as maplibregl.FilterSpecification);
    if (!ids.length) return;
    for (const prop of ['circle-radius', 'circle-opacity']) m.setPaintProperty('buses-pulse', `${prop}-transition` as never, { duration: 0, delay: 0 } as never);
    const t0 = performance.now();
    const i = setInterval(() => {
      if (document.hidden) return;
      const ph = ((performance.now() - t0) % 1400) / 1400;
      m.setPaintProperty('buses-pulse', 'circle-radius', 20 + ph * 16);
      m.setPaintProperty('buses-pulse', 'circle-opacity', 0.55 * (1 - ph));
    }, 160);
    return () => clearInterval(i);
  });
  $effect(() => {
    if (!gen || !map) return;
    // stale bike data: fade the markers
    const o = $bikesOk ? 1 : 0.35;
    if (map.getLayer('bikes')) { map.setPaintProperty('bikes', 'circle-opacity', o); map.setPaintProperty('bikes', 'circle-stroke-opacity', o); }
    if (map.getLayer('bikes-count')) map.setPaintProperty('bikes-count', 'text-opacity', o);
  });
  $effect(() => {
    if (!gen || !map) return;
    if (map.getLayer('lines-hl')) map.setFilter('lines-hl', ['==', ['get', 'routeId'], $highlightLine ?? ''] as maplibregl.FilterSpecification);
    const dim = !!($highlightLine || $tripOverlay);
    if (map.getLayer('lines')) map.setPaintProperty('lines', 'line-opacity', dim ? 0.3 : 0.85);
    if (map.getLayer('lines-casing')) map.setPaintProperty('lines-casing', 'line-opacity', dim ? 0.3 : 0.9);
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
    else {
      // easeTo({ padding }) leaves a persistent camera padding that fitBounds would add its own on top of
      map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      map.fitBounds(b, { padding: padding(), maxZoom: 16, duration: 600 });
    }
  });
</script>

<div class="map" bind:this={el}></div>
{#if fellBack}<div class="note" role="status">{$t('mapFallback')}</div>{/if}
<button class="locate" aria-label={$t('locate')} onclick={locate}>📍</button>
<LayersPanel />

<style>
  .map { position: absolute; inset: 0; }
  .note { position: absolute; left: 10px; right: 64px; top: 10px; z-index: 4; background: var(--bg); padding: 6px 10px; border-radius: 8px; font-size: 0.8rem; box-shadow: var(--shadow); }
  .locate { position: absolute; right: 10px; top: 90px; z-index: 4; width: 44px; height: 44px; border-radius: 10px; background: var(--bg); box-shadow: var(--shadow); font-size: 1.2rem; }
  :global(.rb-marker) { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px; border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4); }
  :global(.rb-marker.from) { background: #1d7a35; }
  :global(.rb-marker.to) { background: #c62828; }
  :global(.rb-place) { display: grid; gap: 2px; min-width: 150px; color: #1d2a3a; }
  :global(.rb-place .cat) { font-size: 0.8rem; color: #5b6772; }
  :global(.rb-place .go) { margin-top: 6px; min-height: 40px; border-radius: 8px; background: var(--accent, #1a56c4); color: #fff; font-weight: 700; }
  :global(.rb-marker.me) { width: 18px; height: 18px; background: #1a73e8; }
</style>
