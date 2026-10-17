<script lang="ts">
  import { LINE_ORDER, type LineRec } from '@rb/shared';
  import type { AppData } from '../lib/data';
  import { navigate } from '../lib/nav';
  import { t, lang } from '../lib/i18n';
  import { savedPlaces, recents, removePlace } from '../lib/places';
  import { tripOverlay, highlightLine, planMarkers, now } from '../lib/ui';
  import { linesRunningOn, nextServiceStart } from '../router/timetable';
  import { formatHM, LINE_STYLE } from '@rb/shared';
  import LineBadge from '../components/LineBadge.svelte';
  import AddPlace from '../components/AddPlace.svelte';
  import NearbyDepartures from '../components/NearbyDepartures.svelte';
  import AlertList from '../components/AlertList.svelte';

  let { data }: { data: AppData } = $props();
  let adding = $state(false);
  let editing = $state(false);
  const lines = $derived(LINE_ORDER.map((id) => data.lines.find((l) => l.routeId === id)).filter((l): l is LineRec => !!l));
  const running = $derived(linesRunningOn(data.timetable, $now.date));
  const activeLines = $derived(lines.filter((l) => running.has(l.routeId)));
  const idleLines = $derived(lines.filter((l) => !running.has(l.routeId)));
  const next = $derived(activeLines.length ? null : nextServiceStart(data.timetable, $now.date));
  const dayName = (d: string) => new Intl.DateTimeFormat($lang === 'en' ? 'en-GB' : 'cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))));

  $effect(() => { if (!$savedPlaces.length) editing = false; });
  $effect(() => { tripOverlay.set(null); highlightLine.set(null); planMarkers.set({}); });
</script>

<button class="primary big" onclick={() => navigate({ name: 'plan', mode: 'now' })}>🔍 {$t('whereTo')}</button>

<AlertList />

<NearbyDepartures {data} />

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
{#snippet lineChips(list: LineRec[])}
  <div class="chips">
    {#each list as l (l.routeId)}
      <button class="line" aria-label={`${$t('lines')} ${l.number}`} onclick={() => navigate({ name: 'line', number: l.number, dir: 0 })}><LineBadge routeId={l.routeId} /></button>
    {/each}
  </div>
{/snippet}
{#if !activeLines.length}
  <p class="noservice" role="status">{$t('noServiceToday')}{#if next} {$t('nextService', { day: dayName(next.date), time: formatHM(next.sec), line: LINE_STYLE[next.routeId].number })}{/if}</p>
{/if}
{#if activeLines.length}
  <p class="sub">{$t('linesActiveToday')}</p>
  {@render lineChips(activeLines)}
{/if}
{#if idleLines.length}
  <p class="sub">{$t('linesIdleToday')}</p>
  <div class="idle">{@render lineChips(idleLines)}</div>
{/if}

<p class="muted small attr">{$t('attribution')}</p>

<style>
  .row-head { display: flex; align-items: center; justify-content: space-between; }
  .link { color: var(--accent); min-height: 32px; }
  .saved { display: inline-flex; align-items: center; }
  .x { width: 44px; min-height: 44px; color: var(--bad); }
  .line { min-width: 44px; display: grid; place-items: center; }
  .attr { margin-top: 24px; }
  .sub { margin: 10px 0 2px; font-weight: 700; font-size: 0.9rem; }
  .idle { opacity: 0.5; }
  .noservice { margin: 8px 0; padding: 10px 12px; border-radius: 10px; background: var(--chip); font-weight: 600; }
</style>
