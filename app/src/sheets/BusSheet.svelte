<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Platform from '../components/Platform.svelte';
  import { untrack } from 'svelte';
  import { formatHM } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { positions, delays, freshVehicles, resolveVehicleTrip, waitingStart, usePositions, positionsOk } from '../lib/live';
  import { netFor } from '../lib/network';
  import { tripDelay } from '../router/delays';
  import { now, focusPoints, tripOverlay, highlightLine } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t, lang } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';
  import DelayBadge from '../components/DelayBadge.svelte';

  let { data, tripId }: { data: AppData; tripId: string } = $props();
  $effect(() => usePositions());
  const v = $derived(freshVehicles($positions, Date.now() + 0 * $now.sec).find((x) => x.tripId === tripId) ?? null);
  const res = $derived(v ? resolveVehicleTrip(v, (d) => netFor(data, d)) : null);
  const pat = $derived(res ? res.net.patterns[res.p] : null);
  const trip = $derived(res && pat ? pat.trips[res.trip] : null);
  const hm = (sec: number) => formatHM(sec);
  const waiting = $derived(v ? waitingStart(v, (d) => netFor(data, d), $now.date, $now.sec) : null);
  const stopsList = $derived.by(() => {
    if (!v || !res || !pat || !trip) return [];
    const cur = v.stopSeq;
    // stopSeq beyond the pattern: the bus is at/after the terminus, show only the last stop
    const found = cur == null ? 0 : pat.seq.findIndex((s) => s >= cur);
    const start = found < 0 ? pat.seq.length - 1 : found;
    return pat.stops.slice(start).map((stopIdx, k) => {
      const pos = start + k;
      const seq = pat.seq[pos];
      const d = tripDelay($delays, tripId, v.startDate, seq);
      return { stopIdx, pos, seq, current: cur != null && (seq === cur || found < 0), eta: trip.arr[pos] + (d ?? 0), delay: d };
    });
  });
  const ts = $derived(v ? new Date(v.ts * 1000).toLocaleTimeString($lang === 'cs' ? 'cs-CZ' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
  // focus keyed on tripId only (and first sight of the vehicle), never on periodic position refreshes
  const seen = $derived(v != null);
  $effect(() => {
    tripOverlay.set(null);
    highlightLine.set(null);
    void tripId;
    if (!seen) return;
    untrack(() => { if (v) focusPoints.set([[v.lon, v.lat]]); });
  });
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => history.length > 1 ? history.back() : navigate({ name: 'home' })}><Icon name="back" /></button>
  {#if v}<h1><LineBadge routeId={v.routeId} /> {#if pat}→ {pat.headsign}{:else}{$t('livePosition')}{/if}</h1>{:else}<h1><Icon name="bus" /></h1>{/if}
</div>

{#if !v}
  {#if $positions || !$positionsOk}<p class="warn">{$t('busGone')}</p>{:else}<p class="muted" aria-busy="true">{$t('loading')}</p>{/if}
{:else if !res || !pat}
  <p><strong>{$t('livePosition')}</strong></p>
  <p class="muted small">{ts}</p>
{:else}
  {@const d = tripDelay($delays, tripId, v.startDate, v.stopSeq ?? 0)}
  {#if waiting}<p class="waiting">{$t('busWaiting', { time: hm(waiting.dep), stop: waiting.net.stops[waiting.stop].name })}</p>{/if}
  <p>{#if d != null}<DelayBadge sec={d} live={true} /> {/if}<span class="muted small">{ts}</span></p>
  <ul class="list">
    {#each stopsList as s (s.pos)}
      <li>
        <button class="row" class:cur={s.current} onclick={() => navigate({ name: 'stop', stopId: res.net.stops[s.stopIdx].id })}>
          <span class="eta">{hm(s.eta)}</span> {res.net.stops[s.stopIdx].name}<Platform p={res.net.stops[s.stopIdx].platform} />
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .warn { color: var(--warn); }
  .cur { font-weight: 800; }
  .waiting { font-weight: 700; }
  .eta { display: inline-block; min-width: 3.4em; font-variant-numeric: tabular-nums; font-weight: 700; }
</style>
