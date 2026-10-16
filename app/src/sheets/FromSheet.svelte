<script lang="ts">
  import type { LineRec } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import type { PlaceRef } from '../router/types';
  import { downstreamStops } from '../router/directRides';
  import { focusPoints, highlightLine, tripOverlay, lineSelection } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import LineBadge from '../components/LineBadge.svelte';
  import PlaceInput from '../components/PlaceInput.svelte';

  let { data, groupId, line: lineNo, dir }: { data: AppData; groupId: string; line?: string; dir?: number } = $props();

  const gi = $derived(data.groups.findIndex((g) => g.id === groupId));
  const group = $derived(gi >= 0 ? data.groups[gi] : null);
  const here = $derived<PlaceRef | undefined>(group ? { lat: group.lat, lon: group.lon, name: group.name } : undefined);

  /** [line, direction] sections to show: just the given line direction, or every line of the group */
  const lastGroup = (l: LineRec, d: number) => {
    const dd = l.directions.find((x) => x.directionId === d);
    return dd ? data.stops[dd.stops[dd.stops.length - 1]].group : -1;
  };
  const lines = $derived.by(() => {
    if (!group) return [];
    if (lineNo) return data.lines.filter((l) => l.number === lineNo);
    return group.lines.flatMap((r) => data.lines.filter((l) => l.routeId === r));
  });
  let chosen = $state<Record<string, number>>({});
  const dirOf = (l: LineRec) => {
    if (lineNo && l.number === lineNo && dir != null) return dir;
    if (chosen[l.number] != null) return chosen[l.number];
    return (l.directions.find((d) => d.stops.some((s) => data.stops[s].group === gi) && lastGroup(l, d.directionId) !== gi) ?? l.directions[0]).directionId;
  };
  let collapsed = $state<Record<string, boolean>>({});
  const isOpen = (l: LineRec, i: number) => (collapsed[l.number] != null ? !collapsed[l.number] : i === 0);

  const sections = $derived(lines.map((l, i) => {
    const d = dirOf(l);
    const direction = l.directions.find((x) => x.directionId === d) ?? l.directions[0];
    const rows = group ? downstreamStops(data.timetable, data.stops, l.routeId, direction.directionId, direction.stops, group.platforms) : [];
    return { l, direction, rows, open: isOpen(l, i) };
  }));

  // map: depends on identity only
  const lon = $derived(group?.lon ?? null);
  const lat = $derived(group?.lat ?? null);
  $effect(() => {
    tripOverlay.set(null);
    highlightLine.set(null);
    if (lon != null && lat != null) focusPoints.set([[lon, lat]]);
  });
  const selDir = $derived(lineNo ? (dir ?? 0) : null);
  $effect(() => {
    if (!lineNo || selDir == null) return;
    lineSelection.set({ number: lineNo, directionId: selDir });
    return () => lineSelection.set(null);
  });

  const choose = (p: PlaceRef) => navigate({ name: 'plan', mode: 'now', from: here, to: p });
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => (history.length > 1 ? history.back() : navigate({ name: 'home' }))}>←</button>
  <h1>{group ? `🚏 ${group.name}` : $t('stopNotFound')}</h1>
</div>

{#if group}
  <PlaceInput label={$t('otherPlace')} value={undefined} stops={data.stops} target="to" onChange={choose} />

  {#each sections as s (s.l.number)}
    <section class="sec">
      <div class="sec-head">
        <button class="toggle" aria-expanded={s.open} onclick={() => (collapsed[s.l.number] = s.open)}>
          <LineBadge routeId={s.l.routeId} /> <span class="head">→ {s.direction.headsign}</span> <span aria-hidden="true">{s.open ? '▾' : '▸'}</span>
        </button>
        {#if !lineNo && s.l.directions.length > 1}
          <button class="secondary flip" aria-label={`${s.l.number} ⇄`} onclick={() => (chosen[s.l.number] = s.l.directions.find((d) => d.directionId !== s.direction.directionId)!.directionId)}>⇄</button>
        {/if}
      </div>
      {#if s.open}
        {#if s.rows.length}
          <ul class="list">
            {#each s.rows as r (r.group)}
              <li>
                <button class="row ds" onclick={() => navigate({ name: 'ride', line: s.l.number, dir: s.direction.directionId, from: group.id, to: data.groups[r.group].id })}>
                  <span>{r.name}</span><span class="muted">+{r.minutes} min</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">{$t('noDirectRide')}</p>
        {/if}
      {/if}
    </section>
  {/each}

  <button class="secondary link" onclick={() => navigate({ name: 'plan', mode: 'now', from: here })}>{$t('planWithChange')}</button>
{/if}

<style>
  .sec { margin-top: 10px; }
  .sec-head { display: flex; gap: 6px; align-items: center; }
  .toggle { flex: 1; display: flex; gap: 8px; align-items: center; min-height: 44px; text-align: left; }
  .head { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .flip { min-width: 44px; min-height: 44px; }
  .ds { width: 100%; display: flex; justify-content: space-between; gap: 8px; text-align: left; }
  .link { margin-top: 14px; width: 100%; }
</style>
