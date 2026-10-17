<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { streetGraph, useStreets, nearestOnFoot } from '../lib/streets';
  import type { AppData } from '../lib/data';
  import { bikes, bikesOk, bikesAt, bikesStaleMin, useBikes } from '../lib/live';
  import { now, focusPoints, tripOverlay, highlightLine } from '../lib/ui';
  import { navigate } from '../lib/nav';
  import { t, lang } from '../lib/i18n';

  let { data, uid }: { data: AppData; uid: number } = $props();
  $effect(() => useBikes());
  const st = $derived($bikes?.find((b) => b.uid === uid) ?? null);
  const stLon = $derived(st?.lon ?? null);
  const stLat = $derived(st?.lat ?? null);
  $effect(() => {
    tripOverlay.set(null);
    highlightLine.set(null);
    // $bikes refreshes every 60 s with new objects; depend only on coordinates
    if (stLon != null && stLat != null) focusPoints.set([[stLon, stLat]]);
  });
  useStreets();
  // nearest platform per stop name, by walking distance
  const nearStops = $derived(st
    ? nearestOnFoot($streetGraph, st, data.stops, 12).map(({ item, m }) => ({ s: item, m }))
        .filter((x, i, arr) => arr.findIndex((y) => y.s.name === x.s.name) === i).slice(0, 3)
    : []);
  const staleMin = $derived(bikesStaleMin($bikesAt, Date.now() + 0 * $now.sec));
  const updated = $derived($bikesAt ? new Date($bikesAt).toLocaleTimeString($lang === 'cs' ? 'cs-CZ' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  const here = () => (st ? { lat: st.lat, lon: st.lon, name: st.name } : undefined);
</script>

<div class="sheet-header">
  <button class="back" aria-label={$t('back')} onclick={() => history.length > 1 ? history.back() : navigate({ name: 'home' })}><Icon name="back" /></button>
  <h1><Icon name="bike" /> {st?.name ?? $t('bikes')}</h1>
</div>

{#if st}
  <p class="big-num"><strong>{$t('bikesAvailable', { n: st.bikes })}</strong> · {$t('freeRacks', { n: st.freeRacks })}</p>
  {#if updated}<p class="muted small">{$t('updatedAt', { t: updated })}</p>{/if}
  {#if staleMin != null}<p class="warn small" role="status">{$t('bikesStale', { n: staleMin })}</p>{/if}
  <p class="muted small">{$t('paid')} · <a href="https://www.nextbikeczech.com/" target="_blank" rel="noopener">{$t('openNextbike')}</a></p>
  <div class="chips">
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', from: here() })}>{$t('planFromHere')}</button>
    <button class="secondary" onclick={() => navigate({ name: 'plan', mode: 'now', to: here() })}>{$t('planToHere')}</button>
  </div>
  <h2><Icon name="stop" /> {$t('stops')}</h2>
  <ul class="list">
    {#each nearStops as x (x.s.id)}<li><button class="row" onclick={() => navigate({ name: 'stop', stopId: x.s.id })}>{x.s.name} · {x.m} m</button></li>{/each}
  </ul>
{:else if !$bikesOk}
  <p class="warn">{$t('bikeUnavailable')}</p>
{:else if $bikes}
  <p>{$t('stationNotFound')}</p>
{:else}
  <p class="muted" aria-busy="true">{$t('loading')}</p>
{/if}

<style>
  .big-num { font-size: 1.1rem; }
  .warn { color: var(--warn); }
</style>
