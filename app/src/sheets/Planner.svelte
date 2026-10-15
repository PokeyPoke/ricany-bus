<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { hmToSec, secToHM, pragueNow } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { route, navigate } from '../lib/nav';
  import type { Route } from '../lib/hashRoute';
  import { t } from '../lib/i18n';
  import { bikes, bikesOk, useBikes, useDelays } from '../lib/live';
  import { getLocation } from '../lib/geoloc';
  import { addRecent } from '../lib/places';
  import { planMarkers, focusPoints, highlightLine, tripOverlay, now } from '../lib/ui';
  import { planInWorker } from '../router/client';
  import type { Itinerary, PlanRequest, PlanResult } from '../router/types';
  import PlaceInput from '../components/PlaceInput.svelte';
  import ItineraryCard from '../components/ItineraryCard.svelte';
  import TripDetail from './TripDetail.svelte';

  type PlanRoute = Extract<Route, { name: 'plan' }>;
  let { data }: { data: AppData } = $props();

  const r = $derived($route as PlanRoute);
  let result = $state<PlanResult | null>(null);
  let busy = $state(false);
  let failed = $state(false);
  let locMsg = $state('');
  let retryTick = $state(0);
  let lastRecent = '';

  $effect(() => useBikes());
  $effect(() => useDelays());

  function update(patch: Partial<PlanRoute>) {
    const cur = get(route);
    if (cur.name !== 'plan') return;
    navigate({ ...cur, ...patch, name: 'plan', sel: undefined }, true);
  }

  onMount(() => {
    highlightLine.set(null);
    if (!r.from) {
      getLocation()
        .then((p) => { const cur = get(route); if (cur.name === 'plan' && !cur.from) update({ from: { ...p, name: get(t)('myLocation') } }); })
        .catch((e: Error) => (locMsg = e.message === 'denied' ? get(t)('locationDenied') : get(t)('locationUnavailable')));
    }
  });
  onDestroy(() => { planMarkers.set({}); tripOverlay.set(null); });

  const req = $derived.by((): PlanRequest | null => {
    if (!r.from || !r.to) return null;
    const n = r.mode === 'now' ? $now : null;
    if (n) return { from: r.from, to: r.to, mode: 'dep', date: n.date, sec: Math.floor(n.sec / 60) * 60 };
    const today = pragueNow();
    return { from: r.from, to: r.to, mode: r.mode === 'arr' ? 'arr' : 'dep', date: r.date ?? today.date, sec: hmToSec(r.time ?? secToHM(today.sec)) };
  });

  const reqKey = $derived(req ? JSON.stringify(req) : null);

  $effect(() => {
    const key = reqKey;
    void retryTick;
    if (!key) { result = null; busy = false; failed = false; return; }
    // Keep the open result stable while a trip is shown.
    if (untrack(() => r.sel && result)) return;
    const q = untrack(() => req)!;
    const b = $bikes;
    let cancelled = false;
    busy = true;
    failed = false;
    planInWorker(q, b, data)
      .then((res) => {
        if (cancelled) return;
        result = res; busy = false;
        if (lastRecent !== key) { lastRecent = key; addRecent(q.to); }
      })
      .catch(() => { if (cancelled) return; result = null; failed = true; busy = false; });
    return () => { cancelled = true; };
  });

  $effect(() => {
    planMarkers.set({ from: r.from, to: r.to });
    if (r.from && r.to && !r.sel) focusPoints.set([[r.from.lon, r.from.lat], [r.to.lon, r.to.lat]]);
  });

  const selected = $derived.by((): Itinerary | null => {
    if (!result || !r.sel) return null;
    const i = Number(r.sel.slice(1));
    if (r.sel[0] === 'f') return result.free[i] ?? null;
    if (r.sel[0] === 'b') return result.bike[i] ?? null;
    if (r.sel === 'w') return result.walk;
    return null;
  });

  const open = (sel: string) => navigate({ ...r, sel });
  const swap = () => update({ from: r.to, to: r.from });
  function setMode(mode: PlanRoute['mode']) {
    const n = pragueNow();
    update(mode === 'now' ? { mode, time: undefined, date: undefined } : { mode, time: r.time ?? secToHM(n.sec), date: r.date ?? n.date });
  }
  function shift(minutes: number) {
    const n = pragueNow();
    const base = r.mode === 'now' ? n.sec : hmToSec(r.time ?? secToHM(n.sec));
    const sec = Math.max(0, Math.min(86340, base + minutes * 60));
    update({ mode: r.mode === 'arr' ? 'arr' : 'dep', time: secToHM(sec), date: r.date ?? n.date });
  }
  const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const fromIso = (s: string) => s.replaceAll('-', '');
</script>

{#if selected}
  <TripDetail it={selected} {data} onBack={() => navigate({ ...r, sel: undefined })} />
{:else}
  <div class="sheet-header">
    <button class="back" aria-label={$t('back')} onclick={() => navigate({ name: 'home' })}>←</button>
    <h1>{$t('whereTo')}</h1>
  </div>

  <div class="fields">
    <div class="inputs">
      <PlaceInput label={$t('from')} value={r.from} stops={data.stops} target="from" onChange={(p) => update({ from: p })} />
      <PlaceInput label={$t('to')} value={r.to} stops={data.stops} target="to" onChange={(p) => update({ to: p })} />
    </div>
    <button class="swap" aria-label={$t('swap')} onclick={swap}>⇅</button>
  </div>
  {#if locMsg && !r.from}<p class="warn small" role="status">{locMsg}</p>{/if}

  <div class="seg" role="group">
    <button aria-pressed={r.mode === 'now'} onclick={() => setMode('now')}>{$t('departNow')}</button>
    <button aria-pressed={r.mode === 'dep'} onclick={() => setMode('dep')}>{$t('departAt')}</button>
    <button aria-pressed={r.mode === 'arr'} onclick={() => setMode('arr')}>{$t('arriveBy')}</button>
  </div>
  {#if r.mode !== 'now'}
    <div class="when">
      <input type="date" aria-label={$t('departAt')} value={isoDate(r.date ?? $now.date)} min={isoDate($now.date)} max={isoDate(data.meta.feedEnd)}
        onchange={(e) => update({ date: fromIso(e.currentTarget.value) })} />
      <input type="time" aria-label={$t('departAt')} value={r.time ?? secToHM($now.sec)} onchange={(e) => update({ time: e.currentTarget.value })} />
    </div>
  {/if}

  {#if busy && !result}<p class="muted" aria-busy="true">{$t('planning')}</p>{/if}
  {#if failed}
    <p class="error">{$t('loadFailed')}</p>
    <button class="secondary" onclick={() => retryTick++}>{$t('retry')}</button>
  {/if}

  {#if result && r.from && r.to}
    {#if result.nearOrigin === 0}<p class="warn" role="status">{$t('noStopsOrigin')}</p>{/if}
    {#if result.nearDest === 0}<p class="warn" role="status">{$t('noStopsDest')}</p>{/if}

    <h2>🆓 {$t('free')}</h2>
    {#if result.free.length}
      <ul class="list">
        {#each result.free as it, i (i)}<li><ItineraryCard {it} stops={data.stops} today={$now.date} onclick={() => open(`f${i}`)} /></li>{/each}
      </ul>
    {:else}
      <p><strong>{$t('noFreeRoute')}</strong></p>
    {/if}
    <div class="shift">
      <button class="secondary" onclick={() => shift(-30)}>‹ {$t('earlier')}</button>
      <button class="secondary" onclick={() => shift(30)}>{$t('later')} ›</button>
    </div>

    {#if result.bike.length}
      <h2>🚲 {$t('withBike')}</h2>
      <ul class="list">
        {#each result.bike as it, i (i)}<li><ItineraryCard {it} stops={data.stops} today={$now.date} onclick={() => open(`b${i}`)} /></li>{/each}
      </ul>
    {/if}

    {#if result.walk}
      <h2>🚶 {$t('walkOnly')}</h2>
      <ul class="list"><li><ItineraryCard it={result.walk} stops={data.stops} today={$now.date} onclick={() => open('w')} /></li></ul>
    {/if}
    {#if !$bikesOk}<p class="muted small" role="status">{$t('bikeUnavailable')}</p>{/if}
  {/if}
{/if}

<style>
  .fields { display: flex; gap: 8px; align-items: center; }
  .inputs { flex: 1; min-width: 0; }
  .swap { width: 44px; font-size: 1.3rem; background: var(--chip); border-radius: 12px; }
  .when { display: flex; gap: 8px; margin-top: 8px; }
  .shift { display: flex; gap: 8px; justify-content: space-between; margin-top: 8px; }
  .warn { color: var(--warn); font-weight: 600; }
  .seg { margin-top: 4px; }
</style>
