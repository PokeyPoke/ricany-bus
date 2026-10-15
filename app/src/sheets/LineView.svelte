<script lang="ts">
  import type { AppData } from '../lib/data';
  import { sampleDate, stopTimetable, dayTypeOf, type DayType } from '../router/timetable';
  import { now, focusPoints, highlightLine, tripOverlay } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';

  let { data, number, dir, stopId }: { data: AppData; number: string; dir: number; stopId: string | undefined } = $props();

  const line = $derived(data.lines.find((l) => l.number === number) ?? null);
  const direction = $derived(line ? (line.directions.find((d) => d.directionId === dir) ?? line.directions[0]) : null);
  let dayType = $state<DayType>(dayTypeOf($now.date));
  const date = $derived(sampleDate(data.timetable, dayType, $now.date));
  const selIdx = $derived.by(() => {
    if (!direction) return -1;
    const i = stopId ? data.stops.findIndex((s) => s.id === stopId) : -1;
    return direction.stops.includes(i) ? i : direction.stops[0];
  });
  const table = $derived(line && direction && date && selIdx >= 0 ? [...stopTimetable(data.timetable, line.routeId, direction.directionId, selIdx, date)] : []);

  // Depends only on line + direction identity (not on $now ticks), so the map is not re-fitted every 30 s.
  $effect(() => {
    if (!line || !direction) return;
    tripOverlay.set(null);
    highlightLine.set(line.routeId);
    focusPoints.set(direction.shape);
    return () => highlightLine.set(null);
  });

  const setDir = (d: number) => navigate({ name: 'line', number, dir: d }, true);
  const setStop = (i: number) => navigate({ name: 'line', number, dir: direction?.directionId ?? 0, stopId: data.stops[i].id }, true);
  const DAYS: DayType[] = ['weekday', 'saturday', 'sunday'];
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => (history.length > 1 ? history.back() : navigate({ name: 'home' }))}>←</button>
  {#if line}<LineBadge routeId={line.routeId} /><h1 class="ln">{line.longName}</h1>{:else}<h1>{$t('lineNotFound')}</h1>{/if}
</div>

{#if line && direction}
  {#if line.directions.length > 1}
    <div class="seg" role="group">
      {#each line.directions as d (d.directionId)}
        <button aria-pressed={d.directionId === direction.directionId} onclick={() => setDir(d.directionId)}>→ {d.headsign}</button>
      {/each}
    </div>
  {/if}

  <h2>{data.stops[selIdx]?.name}</h2>
  <div class="seg" role="group">
    {#each DAYS as d (d)}<button aria-pressed={dayType === d} onclick={() => (dayType = d)}>{$t(d)}</button>{/each}
  </div>
  {#if table.length}
    <div class="tt" role="table">
      {#each table as [h, mins] (h)}
        <div class="tt-row" role="row"><span class="h" role="rowheader">{h}</span><span class="m" role="cell">{mins.map((m) => String(m).padStart(2, '0')).join('  ')}</span></div>
      {/each}
    </div>
  {:else}
    <p class="muted">{$t('noService')}</p>
  {/if}

  <h2>🚏</h2>
  <ol class="stops">
    {#each direction.stops as i (i)}
      <li><button class:sel={i === selIdx} onclick={() => setStop(i)}>{data.stops[i].name}{#if data.stops[i].platform}<small class="muted"> · {data.stops[i].platform}</small>{/if}</button></li>
    {/each}
  </ol>
{/if}

<style>
  .ln { font-size: 1rem; }
  .seg { margin-top: 8px; }
  .tt { display: grid; gap: 2px; margin-top: 8px; font-variant-numeric: tabular-nums; }
  .tt-row { display: grid; grid-template-columns: 36px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--line); }
  .h { font-weight: 800; text-align: right; }
  .m { white-space: pre-wrap; }
  .stops { margin: 0; padding-left: 22px; }
  .stops button { min-height: 40px; text-align: left; }
  .stops button.sel { font-weight: 800; color: var(--accent); }
</style>
