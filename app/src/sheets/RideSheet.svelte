<script lang="ts">
  import { addDays, formatHM } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { directRides } from '../router/directRides';
  import { tripDelay } from '../router/delays';
  import { netFor } from '../lib/network';
  import { delays, delaysOk, useDelays } from '../lib/live';
  import { now, focusPoints, highlightLine, tripOverlay, lineSelection } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t, lang } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';
  import DelayBadge from '../components/DelayBadge.svelte';

  let { data, line: lineNo, dir, from, to }: { data: AppData; line: string; dir: number; from: string; to: string } = $props();

  const line = $derived(data.lines.find((l) => l.number === lineNo) ?? null);
  const gFrom = $derived(data.groups.find((g) => g.id === from) ?? null);
  const gTo = $derived(data.groups.find((g) => g.id === to) ?? null);
  const place = (g: { name: string; lat: number; lon: number }) => ({ lat: g.lat, lon: g.lon, name: g.name });

  $effect(() => useDelays());

  const rides = $derived.by(() => {
    if (!line || !gFrom || !gTo) return [];
    const n = $now;
    return directRides((d) => netFor(data, d), n.date, n.sec - 60, line.routeId, dir, gFrom.platforms, gTo.platforms, 6);
  });

  // map: identity of the ride request only
  const fLon = $derived(gFrom?.lon), fLat = $derived(gFrom?.lat), tLon = $derived(gTo?.lon), tLat = $derived(gTo?.lat);
  $effect(() => {
    tripOverlay.set(null);
    highlightLine.set(null);
    if (fLon != null && fLat != null && tLon != null && tLat != null) focusPoints.set([[fLon, fLat], [tLon, tLat]]);
  });
  $effect(() => {
    if (!line) return;
    lineSelection.set({ number: line.number, directionId: dir });
    return () => lineSelection.set(null);
  });

  function dayLabel(date: string): string {
    if (date === addDays($now.date, 1)) return $t('tomorrow');
    return new Intl.DateTimeFormat($lang === 'en' ? 'en-GB' : 'cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8))));
  }
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => (history.length > 1 ? history.back() : navigate({ name: 'home' }))}>←</button>
  {#if line && gFrom && gTo}
    <LineBadge routeId={line.routeId} /><h1 class="ln">{gFrom.name} → {gTo.name}</h1>
  {:else}<h1>{$t('stopNotFound')}</h1>{/if}
</div>

{#if line && gFrom && gTo}
  {#if rides.length}
    <ul class="list">
      {#each rides as r (`${r.tripId}-${r.serviceDate}`)}
        {@const d = r.date === $now.date ? tripDelay($delays, r.tripId, r.serviceDate, r.boardSeq) : null}
        <li class="ride">
          <span class="time">{formatHM(r.dep)}</span>
          <span class="arr">→ {formatHM(r.arr)} · {Math.round((r.arr - r.dep) / 60)} min</span>
          <span class="when">{#if r.date !== $now.date}{dayLabel(r.date)}{:else}<DelayBadge sec={d} live={$delaysOk} />{/if}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">{$t('noDirectRide')}</p>
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', from: place(gFrom), to: place(gTo) })}>{$t('planFull')}</button>
  {/if}
  {#if rides.length}
    <button class="secondary full" onclick={() => navigate({ name: 'plan', mode: 'now', from: place(gFrom), to: place(gTo) })}>{$t('planFull')}</button>
  {/if}
{/if}

<style>
  .ln { font-size: 1rem; }
  .ride { display: grid; grid-template-columns: 52px 1fr auto; gap: 10px; align-items: center; padding: 10px 2px; }
  .time { font-weight: 700; font-variant-numeric: tabular-nums; }
  .when { font-size: 0.85rem; color: var(--muted); text-align: right; white-space: nowrap; }
  .full { margin-top: 12px; width: 100%; }
</style>
