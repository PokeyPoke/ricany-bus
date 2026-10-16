<script lang="ts">
  import { onMount } from 'svelte';
  import { pragueNow } from '@rb/shared';
  import Home from './sheets/Home.svelte';
  import Planner from './sheets/Planner.svelte';
  import StopBoard from './sheets/StopBoard.svelte';
  import BikeStation from './sheets/BikeStation.svelte';
  import BusSheet from './sheets/BusSheet.svelte';
  import FromSheet from './sheets/FromSheet.svelte';
  import RideSheet from './sheets/RideSheet.svelte';
  import About from './sheets/About.svelte';
  import LineView from './sheets/LineView.svelte';
  import BottomSheet from './components/BottomSheet.svelte';
  import MapView from './map/MapView.svelte';
  import { route, navigate } from './lib/nav';
  import { t, lang } from './lib/i18n';
  import { loadData, daysLeft, type AppData } from './lib/data';

  let data = $state.raw<AppData | null>(null); // raw: large, immutable, and must be structured-cloneable for the router worker
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
    <button class="icon" aria-label={$t('about')} onclick={() => navigate({ name: 'about' })}>ⓘ</button>
    <button class="icon" aria-label={$t('langToggle')} onclick={() => lang.update((l) => (l === 'cs' ? 'en' : 'cs'))}>{$lang === 'cs' ? 'EN' : 'CZ'}</button>
  </header>
  {#if stale}<div class="banner" role="status">{$t('staleData')}</div>{/if}
  {#if !online}<div class="banner" role="status">{$t('offline')}</div>{/if}
  <main class="stage">
    {#if data}
      <MapView {data} />
      <BottomSheet>
        {#if $route.name === 'plan'}
          <Planner {data} />
        {:else if $route.name === 'stop'}
          <StopBoard {data} stopId={$route.stopId} />
        {:else if $route.name === 'line'}
          <LineView {data} number={$route.number} dir={$route.dir} stopId={$route.stopId} />
        {:else if $route.name === 'from'}
          <FromSheet {data} groupId={$route.groupId} line={$route.line} dir={$route.dir} />
        {:else if $route.name === 'ride'}
          <RideSheet {data} line={$route.line} dir={$route.dir} from={$route.from} to={$route.to} />
        {:else if $route.name === 'bike'}
          <BikeStation {data} uid={$route.uid} />
        {:else if $route.name === 'about'}
          <About {data} />
        {:else if $route.name === 'bus'}
          <BusSheet {data} tripId={$route.tripId} />
        {:else}
          <Home {data} />
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
  .stage { position: relative; flex: 1; overflow: hidden; }
  .center { display: grid; place-items: center; align-content: center; gap: 12px; height: 100%; }
</style>
