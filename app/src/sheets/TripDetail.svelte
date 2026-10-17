<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Platform from '../components/Platform.svelte';
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
  import AlertList from '../components/AlertList.svelte';
  import LeaveCountdown from '../components/LeaveCountdown.svelte';
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

  let toast = $state('');
  let manualUrl = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(toastTimer));
  async function share() {
    const r = await shareLink(location.href, `${formatHM(it.depart)} – ${formatHM(it.arrive)}`);
    if (r === 'copied') {
      toast = $t('linkCopied');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast = ''), 2500);
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
  <button class="back" aria-label={$t('back')} onclick={onBack}><Icon name="back" /></button>
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
<div class="toast" class:on={!!toast} role="status">{toast}</div>

<LeaveCountdown {it} boardDelay={ov.boardDelay} />
<AlertList routes={it.legs.flatMap((l) => (l.kind === 'bus' ? [l.routeId] : []))} />
<ol class="legs">
  {#each it.legs as l, i (i)}
    <li class="leg {l.kind}">
      <div class="time">{formatHM(l.depart)}{#if l.kind === 'bus' && $delaysOk}<DelayBadge sec={ov.boardDelay[i]} live={$delaysOk} />{/if}</div>
      <div class="body">
        {#if l.kind === 'walk'}
          <div><Icon name="walk" /> {$t('walkFor', { n: mins(l.depart, l.arrive), m: l.meters })}</div>
          <div class="small muted">→ {l.to.name}</div>
        {:else if l.kind === 'bike'}
          <div><Icon name="bike" /> {$t('bikeFor', { n: mins(l.depart, l.arrive), m: l.meters })} <span class="tag-paid">{$t('paid')}</span></div>
          <div class="small muted">{l.from.name} → {l.to.name}</div>
          <div class="small muted">{$t('bikesNow', { n: l.from.bikes })}</div>
        {:else}
          {#if ov.transferRisk[i]}<p class="risk" role="status"><Icon name="warn" size={16} /> {$t('transferRisk')}</p>{/if}
          <div class="line"><LineBadge routeId={l.routeId} /> <span>{$t('toward', { h: l.headsign })}</span></div>
          <button class="stoplink" onclick={() => navigate({ name: 'stop', stopId: data.stops[l.from].id })}>{data.stops[l.from].name}<Platform p={data.stops[l.from].platform} /></button>
          {#if data.stops[l.from].access === 2}<div class="small barrier"><Icon name="access" size={16} /> {$t('platformNotAccessible')}</div>{/if}
          <div class="small muted">{$t('stopsCount', { n: l.stopCount })}</div>
          {#if liveLine(l)}<div class="small live"><Icon name="bus" size={16} /> {liveLine(l)}</div>{/if}
          <div class="arr">
            {formatHM(l.arrive)}{#if $delaysOk}<DelayBadge sec={ov.alightDelay[i]} live={$delaysOk} />{/if}
            <button class="stoplink" onclick={() => navigate({ name: 'stop', stopId: data.stops[l.to].id })}>{data.stops[l.to].name}<Platform p={data.stops[l.to].platform} /></button>
          </div>
          {#if data.stops[l.to].access === 2}<div class="small barrier"><Icon name="access" size={16} /> {$t('platformNotAccessible')}</div>{/if}
        {/if}
      </div>
    </li>
  {/each}
  <li class="leg end"><div class="time">{formatHM(it.arrive)}</div><div class="body"><Icon name="flag" label={$t('arrival')} /></div></li>
</ol>

<style>
  .barrier { color: var(--warn); }
  .share { margin-left: auto; min-height: 44px; }
  .manual { display: block; font-size: 0.8rem; color: var(--muted); margin-top: 6px; }
  .manual input { width: 100%; }
  .toast:not(.on) { opacity: 0; pointer-events: none; padding: 0; box-shadow: none; }
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
