<script lang="ts">
  import Icon from './Icon.svelte';
  import Platform from './Platform.svelte';
  import { formatHM } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { netFor } from '../lib/network';
  import { departuresAt, boardWindow } from '../router/departures';
  import { tripDelay } from '../router/delays';
  import { delays, delaysOk, useDelays } from '../lib/live';
  import { now, userPos } from '../lib/ui';
  import { getLocation } from '../lib/geoloc';
  import { streetGraph, useStreets, nearestOnFoot } from '../lib/streets';
  import { navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import LineBadge from './LineBadge.svelte';
  import DelayBadge from './DelayBadge.svelte';

  let { data }: { data: AppData } = $props();
  const STOPS = 2, PER_STOP = 3, MAX_M = 1000;

  let state = $state<'idle' | 'locating' | 'denied' | 'failed'>('idle');
  function locate() {
    state = 'locating';
    getLocation().then(() => (state = 'idle')).catch((e: Error) => (state = e.message === 'denied' ? 'denied' : 'failed'));
  }
  // locate without asking when the browser already allows it; otherwise wait for a tap
  $effect(() => {
    if ($userPos || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate(); }).catch(() => {});
  });
  useStreets();
  $effect(() => useDelays());

  const near = $derived($userPos ? nearestOnFoot($streetGraph, $userPos, data.groups, STOPS + 3, MAX_M) : []);
  const boards = $derived(near.map(({ item: g, sec }) => {
    const n = $now;
    const list = g.platforms.flatMap((i) => departuresAt(netFor(data, n.date), i, n.sec - 15 * 60, 20).map((d) => ({ ...d, stop: i })));
    const deps = boardWindow(list, n.sec, (d) => tripDelay($delays, d.tripId, d.serviceDate, d.seq), PER_STOP);
    return { g, walkMin: Math.max(1, Math.round(sec / 60)), deps };
  }).filter((b) => b.deps.length).slice(0, STOPS)); // stops with nothing left today give way to the next nearest
  const inMin = (dep: number, delay: number | null) => {
    const diff = Math.round((dep + (delay ?? 0) - $now.sec) / 60);
    return diff <= 0 ? $t('nowShort') : diff < 60 ? $t('inMin', { n: diff }) : '';
  };
</script>

<h2>{$t('nearby')}</h2>
{#if !$userPos}
  <button class="secondary near-btn" onclick={locate} aria-busy={state === 'locating'}><Icon name="locate" /> {state === 'locating' ? $t('locating') : $t('showNearby')}</button>
  {#if state === 'denied'}<p class="small muted">{$t('locationDenied')}</p>{:else if state === 'failed'}<p class="small muted">{$t('locationFailed')}</p>{/if}
{:else if !near.length}
  <p class="muted">{$t('noStopNearby')}</p>
{:else if !boards.length}
  <!-- stops are near, the buses are just done for today: say so and link the stops (their boards show the next day) -->
  <p class="muted">{$t('nearbyDoneToday')}</p>
  {#each near.slice(0, STOPS) as n (n.item.id)}
    <button class="stop-head" onclick={() => navigate({ name: 'stop', stopId: n.item.id })}><Icon name="stop" /> {n.item.name} <span class="muted small">· <Icon name="walk" size={15} /> {Math.max(1, Math.round(n.sec / 60))} min</span></button>
  {/each}
{:else}
  {#each boards as b (b.g.id)}
    <button class="stop-head" onclick={() => navigate({ name: 'stop', stopId: b.g.id })}><Icon name="stop" /> {b.g.name} <span class="muted small">· <Icon name="walk" size={15} /> {b.walkMin} min</span></button>
    {#if b.deps.length}
      <ul class="list">
        {#each b.deps as d (`${d.tripId}-${d.serviceDate}-${d.stop}`)}
          {@const delay = tripDelay($delays, d.tripId, d.serviceDate, d.seq)}
          <li class="dep">
            <span class="time">{formatHM(d.dep)}</span>
            <LineBadge routeId={d.routeId} />
            <span class="head">{d.headsign}<Platform p={data.stops[d.stop].platform} /></span>
            <span class="when">{inMin(d.dep, delay)}<DelayBadge sec={delay} live={$delaysOk} /></span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="small muted">{$t('noMoreToday')}</p>
    {/if}
  {/each}
{/if}

<style>
  .near-btn { width: 100%; }
  .stop-head { display: block; width: 100%; text-align: left; font-weight: 700; min-height: 44px; margin-top: 4px; }
  .dep { display: grid; grid-template-columns: 3.2em auto 1fr auto; gap: 8px; align-items: center; min-height: 40px; }
  .time { font-weight: 700; font-variant-numeric: tabular-nums; }
  .head { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { white-space: nowrap; font-size: 0.9rem; }
</style>
