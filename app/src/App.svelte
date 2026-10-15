<script lang="ts">
  import { onMount } from 'svelte';
  import { pragueNow } from '@rb/shared';
  import BottomSheet from './components/BottomSheet.svelte';
  import { route, navigate } from './lib/nav';
  import { t, lang } from './lib/i18n';
  import { loadData, daysLeft, type AppData } from './lib/data';
  import { bikesLayerOn } from './lib/ui';

  let data = $state<AppData | null>(null);
  let failed = $state(false);
  let online = $state(navigator.onLine);

  function load() {
    failed = false;
    loadData().then((d) => (data = d)).catch(() => (failed = true));
  }
  onMount(() => {
    load();
    const on = () => (online = navigator.onLine);
    addEventListener('online', on);
    addEventListener('offline', on);
    return () => { removeEventListener('online', on); removeEventListener('offline', on); };
  });
  const stale = $derived(data ? daysLeft(data.meta, pragueNow().date) < 3 : false);
</script>

<div class="app">
  <header class="topbar">
    <button class="search" onclick={() => navigate({ name: 'plan', mode: 'now' })}>🔍 {$t('whereTo')}</button>
    <button class="icon" aria-pressed={$bikesLayerOn} aria-label={$t('layerBikes')} onclick={() => bikesLayerOn.update((v) => !v)}>🚲</button>
    <button class="icon" aria-label={$t('langToggle')} onclick={() => lang.update((l) => (l === 'cs' ? 'en' : 'cs'))}>{$lang === 'cs' ? 'EN' : 'CZ'}</button>
  </header>
  {#if stale}<div class="banner" role="status">{$t('staleData')}</div>{/if}
  {#if !online}<div class="banner" role="status">{$t('offline')}</div>{/if}
  <main class="stage">
    {#if data}
      <!-- MAP -->
      <BottomSheet>
        {#if $route.name === 'plan'}
          <!-- SHEET:plan -->
        {:else if $route.name === 'stop'}
          <!-- SHEET:stop -->
        {:else if $route.name === 'line'}
          <!-- SHEET:line -->
        {:else if $route.name === 'bike'}
          <!-- SHEET:bike -->
        {:else}
          <!-- SHEET:home -->
        {/if}
      </BottomSheet>
    {:else if failed}
      <div class="center"><p>{$t('loadFailed')}</p><button class="primary" onclick={load}>{$t('retry')}</button></div>
    {:else}
      <div class="center" aria-busy="true">{$t('loading')}</div>
    {/if}
  </main>
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100dvh; }
  .topbar { display: flex; gap: 8px; padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top)); background: var(--bg); box-shadow: var(--shadow); z-index: 10; }
  .search { flex: 1; text-align: left; background: var(--chip); border-radius: 12px; padding: 0 14px; color: var(--muted); }
  .icon { width: 44px; border-radius: 12px; background: var(--chip); font-weight: 700; }
  .icon[aria-pressed='false'] { opacity: 0.5; }
  .stage { position: relative; flex: 1; overflow: hidden; }
  .center { display: grid; place-items: center; align-content: center; gap: 12px; height: 100%; }
</style>
