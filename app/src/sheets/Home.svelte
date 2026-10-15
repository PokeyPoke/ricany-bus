<script lang="ts">
  import { LINE_ORDER, type LineRec } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { navigate } from '../lib/nav';
  import { t } from '../lib/i18n';
  import { savedPlaces, recents, removePlace } from '../lib/places';
  import { tripOverlay, highlightLine, planMarkers } from '../lib/ui';
  import LineBadge from '../components/LineBadge.svelte';
  import AddPlace from '../components/AddPlace.svelte';

  let { data }: { data: AppData } = $props();
  let adding = $state(false);
  let editing = $state(false);
  const lines = $derived(LINE_ORDER.map((id) => data.lines.find((l) => l.routeId === id)).filter((l): l is LineRec => !!l));

  $effect(() => { tripOverlay.set(null); highlightLine.set(null); planMarkers.set({}); });
</script>

<button class="primary big" onclick={() => navigate({ name: 'plan', mode: 'now' })}>🔍 {$t('whereTo')}</button>

<div class="row-head">
  <h2>{$t('myPlaces')}</h2>
  {#if $savedPlaces.length}<button class="link" onclick={() => (editing = !editing)}>{editing ? $t('done') : $t('edit')}</button>{/if}
</div>
<div class="chips">
  {#each $savedPlaces as p (p.id)}
    <span class="saved">
      <button class="chip" onclick={() => navigate({ name: 'plan', mode: 'now', to: { lat: p.lat, lon: p.lon, name: p.label } })}>{p.icon} {p.label}</button>
      {#if editing}<button class="x" aria-label={`${$t('remove')} ${p.label}`} onclick={() => removePlace(p.id)}>✕</button>{/if}
    </span>
  {/each}
  {#if !adding}<button class="chip" onclick={() => (adding = true)}>＋ {$t('addPlace')}</button>{/if}
</div>
{#if adding}<AddPlace stops={data.stops} onDone={() => (adding = false)} />{/if}

{#if $recents.length}
  <h2>{$t('recent')}</h2>
  <ul class="list">
    {#each $recents as r (`${r.lat},${r.lon}`)}
      <li><button class="row" onclick={() => navigate({ name: 'plan', mode: 'now', to: r })}>🕘 {r.name}</button></li>
    {/each}
  </ul>
{/if}

<h2>{$t('lines')}</h2>
<div class="chips">
  {#each lines as l (l.routeId)}
    <button class="line" aria-label={`${$t('lines')} ${l.number}`} onclick={() => navigate({ name: 'line', number: l.number, dir: 0 })}><LineBadge routeId={l.routeId} /></button>
  {/each}
</div>

<p class="muted small attr">{$t('attribution')}</p>

<style>
  .row-head { display: flex; align-items: center; justify-content: space-between; }
  .link { color: var(--accent); min-height: 32px; }
  .saved { display: inline-flex; align-items: center; }
  .x { width: 32px; min-height: 32px; color: var(--bad); }
  .line { min-width: 44px; display: grid; place-items: center; }
  .attr { margin-top: 24px; }
</style>
