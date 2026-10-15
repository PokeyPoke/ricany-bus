<script lang="ts">
  import type { StopRec } from '@rb/shared';
  import type { PlaceRef } from '../router/types';
  import { searchStops, searchPhoton, type PlaceHit } from '../lib/geocode';
  import { getLocation } from '../lib/geoloc';
  import { savedPlaces } from '../lib/places';
  import { pickTarget, mapPick } from '../lib/ui';
  import { t } from '../lib/i18n';

  let { label, value, stops, target, onChange }: {
    label: string; value: PlaceRef | undefined; stops: StopRec[]; target: 'from' | 'to' | 'add'; onChange: (p: PlaceRef) => void;
  } = $props();

  let q = $state('');
  let open = $state(false);
  let hits = $state<PlaceHit[]>([]);
  let msg = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | null = null;
  const inputId = $derived(`pi-${target}`);

  function onInput() {
    open = true;
    msg = '';
    clearTimeout(timer);
    const query = q.trim();
    hits = searchStops(stops, query);
    if (query.length < 3) return;
    timer = setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const remote = await searchPhoton(query, ctrl.signal);
        hits = [...searchStops(stops, query), ...remote];
      } catch (e) {
        if ((e as Error).name !== 'AbortError') msg = $t('geocodeFailed');
      }
    }, 250);
  }
  function choose(p: PlaceRef) {
    onChange({ lat: p.lat, lon: p.lon, name: p.name });
    q = '';
    open = false;
    hits = [];
    msg = '';
  }
  async function useMe() {
    try {
      const p = await getLocation();
      choose({ ...p, name: $t('myLocation') });
    } catch (e) {
      msg = (e as Error).message === 'denied' ? $t('locationDenied') : $t('locationUnavailable');
    }
  }
  function pick() {
    open = false;
    pickTarget.set(target);
  }
  $effect(() => {
    const p = $mapPick;
    if (p && $pickTarget === target) {
      pickTarget.set(null);
      mapPick.set(null);
      choose({ ...p, name: $t('pointOnMap') });
    }
  });
</script>

<div class="pi">
  <label for={inputId}>{label}</label>
  <input
    id={inputId} type="search" autocomplete="off" bind:value={q} oninput={onInput}
    onfocus={() => (open = true)} onblur={() => setTimeout(() => (open = false), 200)}
    onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
    placeholder={value?.name ?? $t('searchPlaceholder')} class:has-value={!!value}
  />
  {#if $pickTarget === target}<p class="hint">{$t('tapMapHint')}</p>{/if}
  {#if open}
    <ul class="suggest" role="listbox" aria-label={label}>
      <li><button type="button" class="row" onmousedown={(e) => e.preventDefault()} onclick={useMe}>📍 {$t('myLocation')}</button></li>
      <li><button type="button" class="row" onmousedown={(e) => e.preventDefault()} onclick={pick}>📌 {$t('pickOnMap')}</button></li>
      {#each $savedPlaces as s (s.id)}
        <li><button type="button" class="row" onmousedown={(e) => e.preventDefault()} onclick={() => choose({ lat: s.lat, lon: s.lon, name: s.label })}>{s.icon} {s.label}</button></li>
      {/each}
      {#each hits as h, i (`${h.kind}-${h.name}-${i}`)}
        <li><button type="button" class="row" onmousedown={(e) => e.preventDefault()} onclick={() => choose(h)}>
          <span>{h.kind === 'stop' ? '🚏' : '📌'}</span><span>{h.name} <small class="muted">{h.detail}</small></span>
        </button></li>
      {/each}
      {#if msg}<li class="msg" role="status">{msg}</li>{/if}
    </ul>
  {/if}
  {#if msg && !open}<p class="msg" role="status">{msg}</p>{/if}
</div>

<style>
  .pi { position: relative; margin-bottom: 8px; }
  label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 2px; }
  input.has-value::placeholder { color: var(--fg); opacity: 1; font-weight: 600; }
  .suggest { position: absolute; z-index: 20; left: 0; right: 0; list-style: none; margin: 4px 0 0; padding: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); max-height: 50vh; overflow-y: auto; }
  .suggest .row { width: 100%; text-align: left; display: flex; gap: 8px; align-items: center; padding: 8px; border-radius: 8px; }
  .suggest .row:hover { background: var(--chip); }
  .hint { color: var(--accent); font-weight: 600; margin: 4px 0; }
  .msg { color: var(--warn); padding: 8px; font-size: 0.9rem; }
</style>
