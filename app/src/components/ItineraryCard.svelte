<script lang="ts">
  import { addDays, formatHM, type StopRec } from '@rb/shared';
  import type { Itinerary } from '../router/types';
  import { tripDelay, overlayDelays } from '../router/delays';
  import { delays, delaysOk } from '../lib/live';
  import { t } from '../lib/i18n';
  import LineBadge from './LineBadge.svelte';
  import DelayBadge from './DelayBadge.svelte';

  let { it, stops, today, onclick }: { it: Itinerary; stops: StopRec[]; today: string; onclick: () => void } = $props();
  const firstBus = $derived(it.legs.find((l) => l.kind === 'bus'));
  const risk = $derived(overlayDelays(it, $delays).transferRisk.some(Boolean));
  const mins = (a: number, b: number) => Math.max(1, Math.round((b - a) / 60));
  const dayLabel = $derived(it.date === today ? '' : it.date === addDays(today, 1) ? $t('tomorrow') : `${+it.date.slice(6, 8)}. ${+it.date.slice(4, 6)}.`);
</script>

<button class="card" {onclick}>
  <div class="top">
    <strong class="times">{formatHM(it.depart)} – {formatHM(it.arrive)}</strong>
    <span class="muted">{$t('minutes', { n: mins(it.depart, it.arrive) })}</span>
    {#if dayLabel}<span class="day">{dayLabel}</span>{/if}
    <span class="spacer"></span>
    {#if it.free}<span class="tag-free">{$t('free')}</span>{:else}<span class="tag-paid">{$t('paid')}</span>{/if}
  </div>
  {#if risk}<div class="risk small">⚠️ {$t('transferRisk')}</div>{/if}
  <div class="chain">
    {#each it.legs as l, i (i)}
      {#if i}<span class="sep" aria-hidden="true">›</span>{/if}
      {#if l.kind === 'bus'}<LineBadge routeId={l.routeId} />
      {:else if l.kind === 'walk'}<span class="walk">🚶{mins(l.depart, l.arrive)}</span>
      {:else}<span class="bike">🚲{mins(l.depart, l.arrive)}</span>{/if}
    {/each}
  </div>
  {#if firstBus && firstBus.kind === 'bus'}
    <div class="small muted">
      {formatHM(firstBus.depart)} · {stops[firstBus.from].name}
      <DelayBadge sec={tripDelay($delays, firstBus.tripId, firstBus.serviceDate, firstBus.boardSeq)} live={$delaysOk} />
    </div>
  {/if}
</button>

<style>
  .card { width: 100%; text-align: left; display: grid; gap: 6px; padding: 12px 4px; }
  .top { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .times { font-size: 1.1rem; }
  .day { background: var(--chip); border-radius: 6px; padding: 0 6px; font-size: 0.8rem; font-weight: 600; }
  .spacer { flex: 1; }
  .chain { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .risk { color: var(--bad); font-weight: 700; }
  .sep { color: var(--muted); }
  .walk, .bike { font-size: 0.9rem; }
</style>
