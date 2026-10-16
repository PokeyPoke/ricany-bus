<script lang="ts">
  import { bikesLayerOn, poiLayerOn, buildingsLayerOn } from '../lib/ui';
  import { t } from '../lib/i18n';
  let open = $state(false);
  let root: HTMLDivElement;
  $effect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false; };
    const away = (e: Event) => { if (root && !root.contains(e.target as Node)) open = false; };
    addEventListener('keydown', key);
    addEventListener('pointerdown', away, true);
    return () => { removeEventListener('keydown', key); removeEventListener('pointerdown', away, true); };
  });
</script>

{#snippet sw(label: string, on: boolean, toggle: () => void)}
  <button class="sw" role="switch" aria-checked={on} onclick={toggle}><span class="knob" aria-hidden="true"></span>{label}</button>
{/snippet}

<div class="layers" bind:this={root}>
  <button class="btn" aria-label={$t('layers')} aria-expanded={open} onclick={() => (open = !open)}>🗂</button>
  {#if open}
    <div class="pop" role="group" aria-label={$t('layers')}>
      {@render sw($t('layerBikes'), $bikesLayerOn, () => bikesLayerOn.update((v) => !v))}
      {@render sw($t('layerPlaces'), $poiLayerOn, () => poiLayerOn.update((v) => !v))}
      {@render sw($t('layerBuildings'), $buildingsLayerOn, () => buildingsLayerOn.update((v) => !v))}
    </div>
  {/if}
</div>

<style>
  .layers { position: absolute; right: 10px; top: 140px; z-index: 4; }
  .btn { width: 44px; height: 44px; border-radius: 10px; background: var(--bg); box-shadow: var(--shadow); font-size: 1.2rem; }
  .pop { position: absolute; right: 52px; top: 0; background: var(--bg); box-shadow: var(--shadow); border-radius: 12px; padding: 4px; min-width: 210px; }
  .sw { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 10px; text-align: left; border-radius: 8px; }
  .knob { width: 34px; height: 20px; border-radius: 10px; background: #b8c0c8; position: relative; flex: none; transition: background 0.15s; }
  .knob::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.15s; }
  .sw[aria-checked='true'] .knob { background: var(--accent); }
  .sw[aria-checked='true'] .knob::after { left: 16px; }
</style>
