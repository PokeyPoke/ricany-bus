<script lang="ts">
  import { addDays, formatHM, haversine, LINE_ORDER, type FreeRouteId } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { netFor } from '../lib/network';
  import { departuresAt, boardWindow } from '../router/departures';
  import { tripDelay } from '../router/delays';
  import { delays, delaysOk, useDelays, bikes, useBikes } from '../lib/live';
  import { now, focusPoints, highlightLine, tripOverlay } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t, lang } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';
  import DelayBadge from '../components/DelayBadge.svelte';

  let { data, stopId }: { data: AppData; stopId: string } = $props();
  const LIMIT = 12;

  const stop = $derived(data.stops.find((s) => s.id === stopId) ?? null);
  const group = $derived(stop ? data.stops.flatMap((s, i) => (s.name === stop.name ? [i] : [])) : []);
  const lines = $derived(LINE_ORDER.filter((l) => group.some((i) => data.stops[i].lines.includes(l))) as FreeRouteId[]);

  const stopLon = $derived(stop?.lon ?? null);
  const stopLat = $derived(stop?.lat ?? null);

  $effect(() => useDelays());
  $effect(() => useBikes());
  $effect(() => {
    tripOverlay.set(null);
    highlightLine.set(null);
    // depend only on the stop identity/position, not on periodic store ticks
    if (stopLon != null && stopLat != null) focusPoints.set([[stopLon, stopLat]]);
  });

  const deps = $derived.by(() => {
    const n = $now;
    const collect = (date: string, from: number, day: number) =>
      group.flatMap((i) => departuresAt(netFor(data, date), i, from, 40).map((d) => ({ ...d, stop: i, day })));
    // From 15 min back so late buses still show; the delay-adjusted time decides whether they are gone.
    const today = boardWindow(collect(n.date, n.sec - 15 * 60, 0), n.sec, (d) => tripDelay($delays, d.tripId, d.serviceDate, d.seq), LIMIT);
    if (today.length >= LIMIT) return today;
    // Next date with service (up to 3 days ahead), e.g. Saturday evening -> Monday.
    for (let k = 1; k <= 3; k++) {
      const next = collect(addDays(n.date, k), 0, k).sort((a, b) => a.dep - b.dep).slice(0, LIMIT - today.length);
      if (next.length) return [...today, ...next];
    }
    return today;
  });

  const nearestBike = $derived.by(() => {
    if (!stop || !$bikes?.length) return null;
    return $bikes.map((b) => ({ b, m: Math.round(haversine(stop.lat, stop.lon, b.lat, b.lon)) })).sort((x, y) => x.m - y.m)[0];
  });

  function dayLabel(day: number): string {
    if (day === 1) return $t('tomorrow');
    const d = addDays($now.date, day);
    return new Intl.DateTimeFormat($lang === 'en' ? 'en-GB' : 'cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))));
  }
  function whenLabel(dep: number, delay: number | null, day: number): string {
    if (day > 0) return dayLabel(day);
    const diff = Math.round((dep + (delay ?? 0) - $now.sec) / 60);
    if (diff <= 0) return $t('nowShort');
    return diff < 60 ? $t('inMin', { n: diff }) : '';
  }
  const here = () => (stop ? { lat: stop.lat, lon: stop.lon, name: stop.name } : undefined);
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => history.length > 1 ? history.back() : navigate({ name: 'home' })}>←</button>
  <h1>{stop ? `🚏 ${stop.name}` : $t('stopNotFound')}</h1>
</div>

{#if stop}
  <div class="chips">
    {#each lines as l (l)}
      <button class="line" aria-label={`${$t('lines')} ${l}`} onclick={() => navigate({ name: 'line', number: data.lines.find((x) => x.routeId === l)?.number ?? '', dir: 0, stopId: stop.id })}><LineBadge routeId={l} /></button>
    {/each}
    <span class="spacer"></span>
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', from: here() })}>{$t('planFromHere')}</button>
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', to: here() })}>{$t('planToHere')}</button>
  </div>

  <h2>{$t('departures')}</h2>
  {#if !deps.length || deps[0].day > 0}<p class="muted">{$t('noMoreToday')}</p>{/if}
  <ul class="list">
    {#each deps as d (`${d.tripId}-${d.serviceDate}-${d.stop}`)}
      {@const delay = d.day === 0 ? tripDelay($delays, d.tripId, d.serviceDate, d.seq) : null}
      <li class="dep">
        <span class="time">{formatHM(d.dep)}</span>
        <LineBadge routeId={d.routeId} />
        <span class="head">{d.headsign}{#if data.stops[d.stop].platform}<small class="muted"> · {data.stops[d.stop].platform}</small>{/if}</span>
        <span class="when">{whenLabel(d.dep, delay, d.day)}{#if d.day === 0}<DelayBadge sec={delay} live={$delaysOk} />{/if}</span>
      </li>
    {/each}
  </ul>

  {#if nearestBike}
    <h2>{$t('nearestBike')}</h2>
    <button class="row bike" onclick={() => navigate({ name: 'bike', uid: nearestBike.b.uid })}>
      🚲 {nearestBike.b.name} · {$t('bikesAvailable', { n: nearestBike.b.bikes })} · {nearestBike.m} m
    </button>
  {/if}
{/if}

<style>
  .line { min-width: 44px; display: grid; place-items: center; }
  .spacer { flex: 1; }
  .dep { display: grid; grid-template-columns: 52px auto 1fr auto; gap: 10px; align-items: center; padding: 10px 2px; }
  .time { font-weight: 700; font-variant-numeric: tabular-nums; }
  .head { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { font-size: 0.85rem; color: var(--muted); text-align: right; white-space: nowrap; }
  .bike { width: 100%; text-align: left; background: var(--chip); border-radius: 12px; padding: 0 12px; }
</style>
