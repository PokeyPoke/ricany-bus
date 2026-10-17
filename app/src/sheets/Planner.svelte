<script lang="ts">
  import { dayName } from '../lib/days';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { hmToSec, secToHM, pragueNow, addDays } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { route, navigate, lastHash } from '../lib/nav';
  import { formatRoute, type Route } from '../lib/hashRoute';
  import { t, lang } from '../lib/i18n';
  import { bikes, bikesOk, useBikes, useDelays } from '../lib/live';
  import { getLocation } from '../lib/geoloc';
  import { addRecent, savedPlaces, recents } from '../lib/places';
  import { streetGraph, useStreets, nearestOnFoot } from '../lib/streets';
  import { planMarkers, focusPoints, highlightLine, tripOverlay, now, userPos } from '../lib/ui';
  import { planInWorker } from '../router/client';
  import type { Itinerary, PlanRequest, PlanResult } from '../router/types';
  import PlaceInput from '../components/PlaceInput.svelte';
  import ItineraryCard from '../components/ItineraryCard.svelte';
  import Icon from '../components/Icon.svelte';
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

  // With both ends set the form folds into a one-line summary so the results start at the top of the sheet.
  let editing = $state(false);
  const compact = $derived(!!(r.from && r.to) && !editing);
  const pick = (patch: Partial<PlanRoute>) => { update(patch); editing = false; };

  // empty destination: one-tap choices (saved places, recent searches, nearest stops)
  useStreets();
  const nearStops = $derived($userPos ? nearestOnFoot($streetGraph, $userPos, data.groups, 3, 1500) : []);
  const whenLabel = $derived(r.mode === 'now' ? $t('departNow') : `${r.mode === 'arr' ? $t('arriveBy') : $t('departAt')} ${r.time ?? ''}${r.date && r.date !== $now.date ? ` · ${+r.date.slice(6)}. ${+r.date.slice(4, 6)}.` : ''}`);

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
  const chooseTo = (p: { lat: number; lon: number; name: string }) => pick({ to: { lat: p.lat, lon: p.lon, name: p.name } });
  function setMode(mode: PlanRoute['mode']) {
    const n = pragueNow();
    update(mode === 'now' ? { mode, time: undefined, date: undefined } : { mode, time: r.time ?? secToHM(n.sec), date: r.date ?? n.date });
  }
  function shift(minutes: number) {
    const n = pragueNow();
    const date = r.date ?? n.date;
    const total = (r.mode === 'now' ? n.sec : hmToSec(r.time ?? secToHM(n.sec))) + minutes * 60;
    const dayShift = Math.floor(total / 86400);
    let nd = addDays(date, dayShift);
    let sec = total - dayShift * 86400;
    // never go back before the present moment
    if (nd < n.date || (nd === n.date && sec < n.sec)) { nd = n.date; sec = n.sec; }
    update({ mode: r.mode === 'arr' ? 'arr' : 'dep', time: secToHM(sec), date: nd });
  }
  /** trip detail was opened from this same plan: pop history instead of pushing a duplicate entry */
  function back() {
    const base = formatRoute({ ...r, sel: undefined });
    if (lastHash === base) history.back();
    else navigate({ ...r, sel: undefined });
  }
  const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const fromIso = (s: string) => s.replaceAll('-', '');
</script>

{#if selected}
  <TripDetail it={selected} {data} onBack={back} />
{:else}
  <div class="sheet-header nav-header">
    <button class="back" aria-label={$t('back')} onclick={() => navigate({ name: 'home' })}><Icon name="back" /></button>
    <h1>{$t('whereTo')}</h1>
  </div>

  <div class="plan-form">
  {#if compact}
    <div class="summary">
      <button class="summary-main" aria-label={$t('editSearch')} onclick={() => (editing = true)}>
        <span class="ends"><span class="end">{r.from?.name}</span> <span class="arrow">→</span> <span class="end">{r.to?.name}</span></span>
        <span class="small muted">{whenLabel}</span>
        <Icon name="edit" size={18} />
      </button>
      <button class="swap" aria-label={$t('swap')} onclick={swap}><Icon name="swap" /></button>
    </div>
  {:else}
    <div class="fields">
      <div class="inputs">
        <PlaceInput label={$t('from')} value={r.from} stops={data.stops} target="from" onChange={(p) => pick({ from: p })} />
        <PlaceInput label={$t('to')} value={r.to} stops={data.stops} target="to" onChange={(p) => pick({ to: p })} />
      </div>
      <button class="swap" aria-label={$t('swap')} onclick={swap}><Icon name="swap" /></button>
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
    {#if r.from && r.to}<button class="secondary done" onclick={() => (editing = false)}>{$t('done')}</button>{/if}
  {/if}
  </div>

  {#if !r.to}
    {#if $savedPlaces.length}
      <h2>{$t('myPlaces')}</h2>
      <div class="chips">
        {#each $savedPlaces as p (p.id)}<button class="chip" onclick={() => chooseTo({ lat: p.lat, lon: p.lon, name: p.label })}>{p.icon} {p.label}</button>{/each}
      </div>
    {/if}
    {#if $recents.length}
      <h2>{$t('recent')}</h2>
      <ul class="list">
        {#each $recents.slice(0, 5) as p (`${p.lat},${p.lon}`)}
          <li><button class="row pick" onclick={() => chooseTo(p)}><Icon name="history" size={18} /> {p.name}</button></li>
        {/each}
      </ul>
    {/if}
    {#if nearStops.length}
      <h2>{$t('nearbyStops')}</h2>
      <ul class="list">
        {#each nearStops as { item: g, m } (g.id)}
          <li><button class="row pick" onclick={() => chooseTo(g)}><Icon name="stop" size={18} /> {g.name} <span class="muted small">· {m} m</span></button></li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#if busy && !result}<p class="muted" aria-busy="true">{$t('planning')}</p>{/if}
  {#if failed}
    <p class="error">{$t('loadFailed')}</p>
    <button class="secondary" onclick={() => retryTick++}>{$t('retry')}</button>
  {/if}

  {#if result && r.from && r.to}
    {#if result.nearOrigin === 0}<p class="warn" role="status">{$t('noStopsOrigin')}</p>{/if}
    {#if result.nearDest === 0}<p class="warn" role="status">{$t('noStopsDest')}</p>{/if}

    {#if req && req.mode === 'dep' && req.date === $now.date && result.free.length && result.free.every((it) => it.date !== req.date)}
      <p class="later-day" role="status">{$t('noMoreTodayNext', { day: dayName(result.free[0].date, $lang) })}</p>
    {/if}
    <h2>{$t('free')}</h2>
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
      <h2><Icon name="bike" size={16} /> {$t('withBike')}</h2>
      <ul class="list">
        {#each result.bike as it, i (i)}<li><ItineraryCard {it} stops={data.stops} today={$now.date} onclick={() => open(`b${i}`)} /></li>{/each}
      </ul>
    {/if}

    {#if result.walk}
      <h2><Icon name="walk" size={16} /> {$t('walkOnly')}</h2>
      <ul class="list"><li><ItineraryCard it={result.walk} stops={data.stops} today={$now.date} onclick={() => open('w')} /></li></ul>
    {/if}
    {#if !$bikesOk}<p class="muted small" role="status">{$t('bikeUnavailable')}</p>{/if}
  {/if}
{/if}

<style>
  .later-day { background: var(--chip); border-radius: 10px; padding: 10px 12px; font-weight: 600; }
  .fields { display: flex; gap: 8px; align-items: center; }
  .inputs { flex: 1; min-width: 0; }
  .swap { width: 44px; min-height: 44px; display: grid; place-items: center; background: var(--chip); border-radius: 12px; }
  .summary { display: flex; gap: 8px; align-items: stretch; }
  .summary-main { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 8px; text-align: left; padding: 8px 12px; border-radius: 12px; background: var(--chip); min-height: 56px; }
  .summary-main :global(.icon) { grid-row: 1 / 3; grid-column: 2; align-self: center; color: var(--muted); }
  .ends { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .arrow { color: var(--muted); }
  .done { margin-top: 8px; width: 100%; }
  .pick { display: flex; align-items: center; gap: 8px; }
  .when { display: flex; gap: 8px; margin-top: 8px; }
  .shift { display: flex; gap: 8px; justify-content: space-between; margin-top: 8px; }
  .warn { color: var(--warn); font-weight: 600; }
  .seg { margin-top: 4px; }
</style>
