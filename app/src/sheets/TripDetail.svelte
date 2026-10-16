<script lang="ts">
  import { untrack } from 'svelte';
  import { formatHM } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import type { Itinerary } from '../router/types';
  import { overlayDelays } from '../router/delays';
  import { delays, delaysOk, positions, freshVehicles, usePositions } from '../lib/live';
  import { tripOverlay, focusPoints, now } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { shareLink } from '../lib/share';
  import { t } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';
  import DelayBadge from '../components/DelayBadge.svelte';

  let { it, data, onBack }: { it: Itinerary; data: AppData; onBack: () => void } = $props();
  $effect(() => usePositions());
  const fresh = $derived(freshVehicles($positions, Date.now() + 0 * $now.sec));
  function liveLine(l: Extract<Itinerary['legs'][number], { kind: 'bus' }>): string | null {
    const v = fresh.find((x) => x.tripId === l.tripId && x.startDate === l.serviceDate);
    if (!v || v.stopSeq == null) return null;
    const pat = data.timetable.patterns[l.pattern];
    const pos = pat.seq.findIndex((s) => s >= v.stopSeq!);
    if (pos < 0) return null;
    if (pos > l.alightPos) return null; // bus is already past this leg
    const away = l.boardPos - pos;
    if (away > 0) return $t('busStopsAway', { n: away });
    return $t('busNow', { stop: data.stops[pat.stops[pos]].name });
  }
  const ov = $derived(overlayDelays(it, $delays));
  const mins = (a: number, b: number) => Math.max(1, Math.round((b - a) / 60));
  const stopLabel = (i: number) => `${data.stops[i].name}${data.stops[i].platform ? ` (${data.stops[i].platform})` : ''}`;

  let toast = $state(false);
  let manualUrl = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(toastTimer));
  async function share() {
    const r = await shareLink(location.href, `${formatHM(it.depart)} – ${formatHM(it.arrive)}`);
    if (r === 'copied') {
      toast = true;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast = false), 2500);
    } else if (r === 'manual') manualUrl = location.href;
  }

  const sig = $derived(it.legs.map((l) => (l.kind === 'bus' ? `${l.tripId}@${l.depart}` : `${l.kind}@${l.depart}`)).join('|'));

  $effect(() => {
    void sig;
    untrack(() => {
    tripOverlay.set(it);
    focusPoints.set(it.legs.flatMap((l): [number, number][] => l.kind === 'bus'
      ? [[data.stops[l.from].lon, data.stops[l.from].lat], [data.stops[l.to].lon, data.stops[l.to].lat]]
      : [[l.from.lon, l.from.lat], [l.to.lon, l.to.lat]]));
    });
    return () => tripOverlay.set(null);
  });
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={onBack}>←</button>
  <h1>{formatHM(it.depart)} – {formatHM(it.arrive)}</h1>
  {#if it.free}<span class="tag-free">{$t('free')}</span>{:else}<span class="tag-paid">{$t('paid')}</span>{/if}
  {#if !$delaysOk}<DelayBadge sec={null} live={false} />{/if}
  <button class="secondary share" onclick={share}>{$t('share')}</button>
</div>
{#if manualUrl}
  <label class="manual">{$t('copyLink')}
    <input readonly value={manualUrl} onfocus={(e) => e.currentTarget.select()} />
  </label>
{/if}
{#if toast}<div class="toast" role="status">{$t('linkCopied')}</div>{/if}

<ol class="legs">
  {#each it.legs as l, i (i)}
    <li class="leg {l.kind}">
      <div class="time">{formatHM(l.depart)}{#if l.kind === 'bus' && $delaysOk}<DelayBadge sec={ov.boardDelay[i]} live={$delaysOk} />{/if}</div>
      <div class="body">
        {#if l.kind === 'walk'}
          <div>🚶 {$t('walkFor', { n: mins(l.depart, l.arrive), m: l.meters })}</div>
          <div class="small muted">→ {l.to.name}</div>
        {:else if l.kind === 'bike'}
          <div>🚲 {$t('bikeFor', { n: mins(l.depart, l.arrive), m: l.meters })} <span class="tag-paid">{$t('paid')}</span></div>
          <div class="small muted">{l.from.name} → {l.to.name}</div>
          <div class="small muted">{$t('bikesNow', { n: l.from.bikes })}</div>
        {:else}
          {#if ov.transferRisk[i]}<p class="risk" role="status">⚠️ {$t('transferRisk')}</p>{/if}
          <div class="line"><LineBadge routeId={l.routeId} /> <span>{$t('toward', { h: l.headsign })}</span></div>
          <button class="stoplink" onclick={() => navigate({ name: 'stop', stopId: data.stops[l.from].id })}>{stopLabel(l.from)}</button>
          <div class="small muted">{$t('stopsCount', { n: l.stopCount })}</div>
          {#if liveLine(l)}<div class="small live">🚌 {liveLine(l)}</div>{/if}
          <div class="arr">
            {formatHM(l.arrive)}{#if $delaysOk}<DelayBadge sec={ov.alightDelay[i]} live={$delaysOk} />{/if}
            <button class="stoplink" onclick={() => navigate({ name: 'stop', stopId: data.stops[l.to].id })}>{stopLabel(l.to)}</button>
          </div>
        {/if}
      </div>
    </li>
  {/each}
  <li class="leg end"><div class="time">{formatHM(it.arrive)}</div><div class="body">🏁</div></li>
</ol>

<style>
  .share { margin-left: auto; min-height: 44px; }
  .manual { display: block; font-size: 0.8rem; color: var(--muted); margin-top: 6px; }
  .manual input { width: 100%; }
  .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 30; background: var(--fg); color: var(--bg); padding: 10px 16px; border-radius: 12px; box-shadow: var(--shadow); }
  .legs { list-style: none; margin: 8px 0 0; padding: 0; }
  .leg { display: grid; grid-template-columns: 76px 1fr; gap: 10px; padding: 10px 0; border-left: 4px solid var(--line); padding-left: 10px; }
  .leg.bus { border-left-color: var(--accent); }
  .leg.bike { border-left-color: #2e9d4a; }
  .leg.end { border-left-color: transparent; }
  .time { font-weight: 700; font-variant-numeric: tabular-nums; }
  .line { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
  .stoplink { min-height: 32px; text-align: left; color: var(--accent); font-weight: 600; padding: 0; }
  .arr { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .live { color: var(--accent); font-weight: 600; }
  .risk { color: var(--bad); font-weight: 700; margin: 0 0 6px; }
</style>
