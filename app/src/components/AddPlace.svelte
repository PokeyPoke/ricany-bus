<script lang="ts">
  import type { StopRec } from '@rb/shared';
  import type { PlaceRef } from '../router/types';
  import PlaceInput from './PlaceInput.svelte';
  import { addPlace } from '../lib/places';
  import { t } from '../lib/i18n';

  let { stops, onDone }: { stops: StopRec[]; onDone: () => void } = $props();
  const ICONS = ['🏠', '💼', '🏫', '⭐', '🛒', '❤️'];
  let label = $state('');
  let icon = $state('🏠');
  let place = $state<PlaceRef | undefined>(undefined);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!place || !label.trim()) return;
    addPlace({ label: label.trim(), icon, lat: place.lat, lon: place.lon });
    onDone();
  }
</script>

<form class="add" onsubmit={submit}>
  <label for="ap-name">{$t('placeName')}</label>
  <input id="ap-name" bind:value={label} placeholder={$t('homePlace')} required />
  <div class="icons" role="radiogroup" aria-label="Icon">
    {#each ICONS as i (i)}
      <button type="button" role="radio" aria-checked={icon === i} class:sel={icon === i} onclick={() => (icon = i)}>{i}</button>
    {/each}
  </div>
  <PlaceInput label={$t('searchPlaceholder')} value={place} {stops} target="add" onChange={(p) => (place = p)} />
  <div class="actions">
    <button type="button" class="secondary" onclick={onDone}>{$t('cancel')}</button>
    <button type="submit" class="primary" disabled={!place || !label.trim()}>{$t('save')}</button>
  </div>
</form>

<style>
  .add { background: var(--chip); border-radius: 12px; padding: 12px; margin-top: 8px; display: grid; gap: 8px; }
  label { font-size: 0.8rem; color: var(--muted); }
  .icons { display: flex; gap: 6px; }
  .icons button { width: 44px; border-radius: 10px; background: var(--bg); font-size: 1.2rem; }
  .icons button.sel { outline: 3px solid var(--accent); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  button[disabled] { opacity: 0.5; cursor: default; }
</style>
