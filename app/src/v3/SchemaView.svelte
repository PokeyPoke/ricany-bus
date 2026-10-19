<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import type { FreeRouteId } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { netFor } from '../lib/network';
  import { route, navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import { positions, usePositions, freshVehicles, waitingStart } from '../lib/live';
  import { getLocation } from '../lib/geoloc';
  import { tripOverlay, highlightLine, focusPoints, userPos, planMarkers, lineSelection, now, stopTap, pickTarget, mapPick } from '../lib/ui';
  import Icon from '../components/Icon.svelte';
  import { SCHEMA_W, SCHEMA_H, SCHEMA_COLORS, groupXY, nearestGroup, directionPath, tripPaths, busXY, bounds, type XY } from './schema';

  let { data }: { data: AppData } = $props();

  // ── camera: diagram points → screen pixels: screen = t + p * s ───────────────────────────
  let el: HTMLDivElement;
  let w = $state(400), h = $state(700);
  let s = $state(0.5), tx = $state(0), ty = $state(0);
  let animate = $state(false);
  /** the part of the screen the sheet leaves free (the sheet is ~55 % high on phones, a 400 px side panel on desktop) */
  const view = () => (w < 900 ? { x: 12, y: 12, w: w - 24 - 56, h: h * 0.43 - 12 } : { x: 412, y: 12, w: w - 424 - 56, h: h - 24 });
  const fitScale = () => { const v = view(); return Math.min(v.w / SCHEMA_W, v.h / SCHEMA_H); };
  const MAX_S = 6;

  function clamp() {
    s = Math.max(fitScale() * 0.9, Math.min(MAX_S, s));
    // keep at least a third of the diagram on screen
    const dw = SCHEMA_W * s, dh = SCHEMA_H * s;
    tx = Math.min(w - dw / 3, Math.max(-dw * (2 / 3), tx));
    ty = Math.min(h - dh / 3, Math.max(-dh * (2 / 3), ty));
  }
  /** fit diagram points into the free part of the screen */
  function frame(pts: XY[], maxS = 2.6, anim = true) {
    const b = bounds(pts);
    if (!b) return;
    const v = view(), pad = 28;
    const bw = Math.max(b[1][0] - b[0][0], 1), bh = Math.max(b[1][1] - b[0][1], 1);
    s = Math.min(maxS, (v.w - pad * 2) / bw, (v.h - pad * 2) / bh);
    tx = v.x + v.w / 2 - ((b[0][0] + b[1][0]) / 2) * s;
    ty = v.y + v.h / 2 - ((b[0][1] + b[1][1]) / 2) * s;
    clamp();
    if (anim) { animate = true; setTimeout(() => (animate = false), 350); }
  }
  const whole = (anim = true) => frame([[0, 0], [SCHEMA_W, SCHEMA_H]], 10, anim);

  // ── gestures: drag, pinch, wheel, tap ─────────────────────────────────────────────────────
  const ptrs = new Map<number, { x: number; y: number }>();
  let downAt = { x: 0, y: 0, t: 0 }, moved = 0;
  function down(e: PointerEvent) {
    el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY, t: Date.now() }; moved = 0; }
    animate = false;
  }
  function move(e: PointerEvent) {
    const prev = ptrs.get(e.pointerId);
    if (!prev) return;
    const r = el.getBoundingClientRect();
    if (ptrs.size === 1) {
      tx += e.clientX - prev.x; ty += e.clientY - prev.y;
      moved = Math.max(moved, Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y));
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const other = a === prev ? b : a;
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const mx = (e.clientX + other.x) / 2 - r.left, my = (e.clientY + other.y) / 2 - r.top;
      const pmx = (prev.x + other.x) / 2 - r.left, pmy = (prev.y + other.y) / 2 - r.top;
      zoomAt(pmx, pmy, d0 > 0 ? d1 / d0 : 1);
      tx += mx - pmx; ty += my - pmy;
      moved = 99;
    }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    clamp();
  }
  function up(e: PointerEvent) {
    const was = ptrs.size;
    ptrs.delete(e.pointerId);
    if (was === 1 && moved < 8 && Date.now() - downAt.t < 600) {
      const r = el.getBoundingClientRect();
      tap(e.clientX - r.left, e.clientY - r.top);
    }
  }
  function zoomAt(x: number, y: number, k: number) {
    const ns = Math.max(fitScale() * 0.9, Math.min(MAX_S, s * k));
    tx = x - ((x - tx) * ns) / s; ty = y - ((y - ty) * ns) / s; s = ns;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    clamp();
  }
  const zoomBtn = (k: number) => { animate = true; zoomAt(w / 2, view().y + view().h / 2, k); clamp(); setTimeout(() => (animate = false), 250); };

  /** a tap: the nearest bus or stop within reach (in screen pixels, so it works at every zoom) */
  function tap(x: number, y: number) {
    const px = (x - tx) / s, py = (y - ty) / s, reach = 22 / s;
    let best: { kind: 'bus' | 'stop'; id: string; gi?: number; d: number } | null = null;
    for (const b of buses) {
      const d = Math.hypot(b.xy[0] - px, b.xy[1] - py);
      if (d < reach && (!best || d < best.d)) best = { kind: 'bus', id: b.tripId, d };
    }
    if (!best) data.groups.forEach((g, gi) => {
      const p = groupXY(data, gi);
      if (!p) return;
      const d = Math.hypot(p[0] - px, p[1] - py);
      if (d < reach && (!best || d < best.d)) best = { kind: 'stop', id: g.id, gi, d };
    });
    if (!best) return;
    if (best.kind === 'bus') { navigate({ name: 'bus', tripId: best.id }); return; }
    const g = data.groups[best.gi!];
    if (get(pickTarget)) { mapPick.set({ lat: g.lat, lon: g.lon }); return; }
    const tapFn = get(stopTap);
    if (tapFn) tapFn(g.id); else navigate({ name: 'stop', stopId: g.id });
  }

  // ── what the screen is about: highlight, trip, markers, my stop ─────────────────────────
  const color = (r: FreeRouteId) => SCHEMA_COLORS[r]?.color ?? '#555';
  const linePaths = $derived.by(() => {
    const sel = $lineSelection, rid = $highlightLine;
    const line = sel ? data.lines.find((l) => l.number === sel.number) : rid ? data.lines.find((l) => l.routeId === rid) : null;
    if (!line) return [];
    const dirs = sel ? [sel.dir] : line.directions.map((_, i) => i);
    return dirs.map((d) => ({ color: color(line.routeId), pts: directionPath(data, line, d) })).filter((p) => p.pts.length > 1);
  });
  const trip = $derived($tripOverlay ? tripPaths(data, $tripOverlay).map((p) => ({ color: color(p.routeId), pts: p.pts })) : []);
  const emphasis = $derived([...linePaths, ...trip]);
  const ptsAttr = (pts: XY[]) => pts.map((p) => p.join(',')).join(' ');

  const markerXY = (p: { lat: number; lon: number } | undefined) => {
    if (!p) return null;
    const gi = nearestGroup(data, p, 2000);
    return gi == null ? null : groupXY(data, gi);
  };
  const markA = $derived(markerXY($planMarkers.from));
  const markB = $derived(markerXY($planMarkers.to));
  const meGi = $derived($userPos ? nearestGroup(data, $userPos, 1500) : null);
  const meXY = $derived(meGi == null ? null : groupXY(data, meGi));
  const selectedXY = $derived.by(() => {
    const r = $route;
    if (r.name === 'stop') { const st = data.stops.find((x) => x.id === r.stopId); return st ? groupXY(data, st.group) : null; }
    if (r.name === 'from') { const gi = data.groups.findIndex((g) => g.id === r.groupId); return gi >= 0 ? groupXY(data, gi) : null; }
    return null;
  });

  // the classic screens ask the map to show places (lon/lat): show their stops instead
  $effect(() => {
    const fp = $focusPoints;
    if (!fp?.length) return;
    const pts: XY[] = [];
    const seen = new Set<number>();
    for (const [lon, lat] of fp) {
      const gi = nearestGroup(data, { lat, lon }, 600);
      if (gi != null && !seen.has(gi)) { seen.add(gi); const p = groupXY(data, gi); if (p) pts.push(p); }
    }
    if (pts.length) untrack(() => frame(pts, pts.length === 1 ? 2.4 : 2.6));
  });

  // ── live buses ───────────────────────────────────────────────────────────────────────────
  $effect(() => usePositions());
  const buses = $derived.by(() => {
    void $now;
    const n = $now;
    const nf = (d: string) => netFor(data, d);
    return freshVehicles($positions, Date.now()).flatMap((v) => {
      const xy = busXY(data, v, nf);
      if (!xy) return [];
      const st = SCHEMA_COLORS[v.routeId];
      const number = data.lines.find((l) => l.routeId === v.routeId)?.number ?? '';
      return [{ tripId: v.tripId, xy, color: st.color, text: st.text, number, waiting: !!waitingStart(v, nf, n.date, n.sec) }];
    });
  });

  // ── locate ───────────────────────────────────────────────────────────────────────────────
  let locating = $state(false), farMsg = $state(false);
  async function locate() {
    if (locating) return;
    locating = true; farMsg = false;
    try {
      const p = await getLocation();
      const gi = nearestGroup(data, p, 3000);
      const xy = gi == null ? null : groupXY(data, gi);
      if (xy) frame([xy], 2.6); else farMsg = true;
    } catch { /* quietly, as on the map */ }
    finally { locating = false; }
  }

  onMount(() => {
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); w = r.width; h = r.height; });
    ro.observe(el);
    const r = el.getBoundingClientRect(); w = r.width; h = r.height;
    whole(false);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel); };
  });
  const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
</script>

<div class="schema" bind:this={el} role="application" aria-label={$t('schemaLabel')}
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
  <div class="paper" class:animate style:transform={`translate(${tx}px, ${ty}px) scale(${s})`}>
    <img src={`${import.meta.env.BASE_URL}schema/linky.svg`} width={SCHEMA_W} height={SCHEMA_H} alt="" draggable="false" />
    <svg width={SCHEMA_W} height={SCHEMA_H} viewBox={`0 0 ${SCHEMA_W} ${SCHEMA_H}`} aria-hidden="true">
      <!-- the city's logo and QR code are covered: this is not the city's app -->
      <rect x="40" y="44" width="162" height="50" rx="10" fill="#fff" />
      <text x="121" y="66" text-anchor="middle" class="credit">{$t('schemaCredit')}</text>
      <text x="121" y="78" text-anchor="middle" class="credit">ricany.cz</text>
      <rect x="50" y="298" width="122" height="48" fill="#fff" />
      {#if emphasis.length}
        <rect x="0" y="0" width={SCHEMA_W} height={SCHEMA_H} fill="#fff" opacity="0.6" />
        {#each emphasis as p, i (i)}
          <polyline points={ptsAttr(p.pts)} fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
          <polyline points={ptsAttr(p.pts)} fill="none" stroke={p.color} stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" />
          {#each p.pts as q, j (j)}<circle cx={q[0]} cy={q[1]} r="3.4" fill="#fff" stroke={p.color} stroke-width="2" />{/each}
        {/each}
      {/if}
      {#if selectedXY}<circle cx={selectedXY[0]} cy={selectedXY[1]} r="8" fill="none" stroke="#1d2a3a" stroke-width="2.5" />{/if}
      {#if meXY}
        <circle cx={meXY[0] + 7} cy={meXY[1] - 7} r="7" fill="#1a73e8" opacity="0.18" />
        <circle cx={meXY[0] + 7} cy={meXY[1] - 7} r="3.6" fill="#1a73e8" stroke="#fff" stroke-width="1.5" />
      {/if}
      {#each buses as b (b.tripId)}
        <g opacity={b.waiting ? 0.45 : 1}>
          <circle cx={b.xy[0]} cy={b.xy[1]} r="6.5" fill={b.color} stroke="#fff" stroke-width="1.6" />
          <text x={b.xy[0]} y={b.xy[1] + 2.4} text-anchor="middle" class="bus" fill={b.text}>{b.number}</text>
        </g>
      {/each}
      {#if markA}<g><circle cx={markA[0]} cy={markA[1] - 11} r="6.5" fill="#1d7a35" stroke="#fff" stroke-width="1.6" /><text x={markA[0]} y={markA[1] - 8.6} text-anchor="middle" class="bus" fill="#fff">A</text></g>{/if}
      {#if markB}<g><circle cx={markB[0]} cy={markB[1] - 11} r="6.5" fill="#c62828" stroke="#fff" stroke-width="1.6" /><text x={markB[0]} y={markB[1] - 8.6} text-anchor="middle" class="bus" fill="#fff">B</text></g>{/if}
    </svg>
  </div>
</div>
{#if farMsg}<div class="note" role="status">{$t('schemaFar')}</div>{/if}
<div class="btns">
  <button class="ctl" aria-label={locating ? $t('locating') : $t('locate')} aria-busy={locating} onclick={locate}>{#if locating}<span class="spin"></span>{:else}<Icon name="locate" size={22} />{/if}</button>
  <button class="ctl" aria-label={$t('schemaWhole')} onclick={() => whole()}><Icon name="layers" size={22} /></button>
  {#if fine}
    <button class="ctl txt" aria-label="+" onclick={() => zoomBtn(1.4)}>+</button>
    <button class="ctl txt" aria-label="−" onclick={() => zoomBtn(1 / 1.4)}>−</button>
  {/if}
</div>

<style>
  .schema { position: absolute; inset: 0; overflow: hidden; touch-action: none; background: #fff; cursor: grab; }
  .paper { position: absolute; left: 0; top: 0; transform-origin: 0 0; width: 733.654px; height: 529.559px; }
  .paper.animate { transition: transform 0.33s ease; }
  .paper img, .paper svg { position: absolute; left: 0; top: 0; user-select: none; -webkit-user-drag: none; }
  .credit { font: 600 8.5px system-ui, sans-serif; fill: #3a4a3a; }
  .bus { font: 800 7px system-ui, sans-serif; }
  .btns { position: absolute; right: 10px; top: 10px; z-index: 4; display: grid; gap: 8px; }
  .ctl { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; background: var(--bg); color: var(--fg); box-shadow: var(--shadow); }
  .ctl.txt { font-size: 1.4rem; font-weight: 700; }
  .note { position: absolute; left: 10px; right: 64px; top: 10px; z-index: 4; background: var(--bg); padding: 6px 10px; border-radius: 8px; font-size: 0.8rem; box-shadow: var(--shadow); }
  .spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--accent); animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* the diagram is printed on white: keep it white in dark mode too, framed by the app's dark chrome */
</style>
