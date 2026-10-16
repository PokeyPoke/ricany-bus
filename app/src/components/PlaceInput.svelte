<script lang="ts">
  import { get } from 'svelte/store';
  import type { StopRec } from '@rb/shared';
  import type { PlaceRef } from '../router/types';
  import { searchStops, searchPhoton, norm, type PlaceHit } from '../lib/geocode';
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
  const listId = $derived(`pi-list-${target}`);
  const optId = (i: number) => `pi-opt-${target}-${i}`;
  let activeKey = $state<string | null>(null);

  function cancelSearch() {
    clearTimeout(timer);
    ctrl?.abort();
    ctrl = null;
  }
  const query = $derived(q.trim());
  const savedMatches = $derived(
    query ? $savedPlaces.filter((s) => norm(s.label).includes(norm(query))) : $savedPlaces
  );

  type Item = { key: string; icon: string; text: string; detail?: string; run: () => void };
  const items = $derived.by((): Item[] => {
    const actions: Item[] = [
      { key: 'me', icon: '📍', text: $t('myLocation'), run: useMe },
      { key: 'pick', icon: '📌', text: $t('pickOnMap'), run: pick }
    ];
    const found: Item[] = [
      ...savedMatches.map((s): Item => ({ key: `s-${s.id}`, icon: s.icon, text: s.label, run: () => choose({ lat: s.lat, lon: s.lon, name: s.label }) })),
      ...hits.map((h): Item => ({ key: `${h.kind}-${h.name}-${h.lat.toFixed(5)},${h.lon.toFixed(5)}`, icon: h.kind === 'stop' ? '🚏' : '📌', text: h.name, detail: h.detail, run: () => choose(h) }))
    ];
    return query ? [...found, ...actions] : [...actions, ...found];
  });
  const active = $derived(activeKey === null ? -1 : items.findIndex((i) => i.key === activeKey));
  $effect(() => { if (activeKey !== null && active < 0) activeKey = null; });
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      open = false;
      activeKey = null;
      if ($pickTarget === target) pickTarget.set(null);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { open = true; return; }
      if (!items.length) return;
      const n = items.length;
      const next = active < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      activeKey = items[next].key;
      document.getElementById(optId(next))?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && open && active >= 0 && items[active]) {
      e.preventDefault();
      items[active].run();
    }
  }

  function onInput() {
    activeKey = null;
    open = true;
    msg = '';
    cancelSearch();
    const query = q.trim();
    hits = searchStops(stops, query);
    if (query.length < 3) return;
    timer = setTimeout(async () => {
      const c = new AbortController();
      ctrl = c;
      try {
        const remote = await searchPhoton(query, c.signal);
        if (c.signal.aborted) return;
        hits = [...searchStops(stops, query), ...remote];
      } catch (e) {
        if ((e as Error).name !== 'AbortError') msg = $t('geocodeFailed');
      }
    }, 250);
  }
  function choose(p: PlaceRef) {
    cancelSearch();
    onChange({ lat: p.lat, lon: p.lon, name: p.name });
    q = '';
    activeKey = null;
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
    cancelSearch();
    pickTarget.set(target);
  }
  $effect(() => () => {
    cancelSearch();
    if (get(pickTarget) === target) pickTarget.set(null);
  });
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
    role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
    aria-activedescendant={open && active >= 0 && active < items.length ? optId(active) : undefined}
    onfocus={() => (open = true)} onblur={() => setTimeout(() => (open = false), 200)}
    onclick={() => (open = true)}
    onkeydown={onKey}
    placeholder={value?.name ?? $t('searchPlaceholder')} class:has-value={!!value}
  />
  {#if $pickTarget === target}<p class="hint">{$t('tapMapHint')}</p>{/if}
  {#if open}
    <ul class="suggest" role="listbox" id={listId} aria-label={label}>
      {#if msg}<li class="msg" role="status">{msg}</li>{/if}
      {#each items as it, i (it.key)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li id={optId(i)} role="option" aria-selected={i === active} class="row" class:active={i === active}
          onmousedown={(e) => e.preventDefault()} onclick={it.run}>
          <span aria-hidden="true">{it.icon}</span><span>{it.text}{#if it.detail} <small class="muted">{it.detail}</small>{/if}</span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if msg && !open}<p class="msg" role="status">{msg}</p>{/if}
</div>

<style>
  .pi { position: relative; margin-bottom: 8px; }
  label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 2px; }
  input.has-value::placeholder { color: var(--fg); opacity: 1; font-weight: 600; }
  .suggest { position: absolute; z-index: 20; left: 0; right: 0; list-style: none; margin: 4px 0 0; padding: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); max-height: 40vh; max-height: 40dvh; overflow-y: auto; }
  .suggest .row { text-align: left; display: flex; gap: 8px; align-items: center; padding: 8px; min-height: 44px; border-radius: 8px; cursor: pointer; }
  .suggest .row:hover, .suggest .row.active { background: var(--chip); }
  .suggest .row.active { outline: 2px solid var(--accent); }
  .hint { color: var(--accent); font-weight: 600; margin: 4px 0; }
  .msg { color: var(--warn); padding: 8px; font-size: 0.9rem; }
</style>
