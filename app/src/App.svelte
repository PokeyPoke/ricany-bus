<script lang="ts">
  import { onMount } from 'svelte';
  import UpdateBar from './components/UpdateBar.svelte';
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
  import Icon from './components/Icon.svelte';
  import LangButton from './components/LangButton.svelte';
  import { route, navigate } from './lib/nav';
  import { t } from './lib/i18n';
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
    <!-- the one way into search: always visible, on every screen -->
    <button class="search" onclick={() => navigate({ name: 'plan', mode: 'now' })}><Icon name="search" size={22} /> <span>{$t('whereTo')}</span></button>
    <LangButton />
    <button class="icon" aria-label={$t('about')} onclick={() => navigate({ name: 'about' })}><Icon name="info" size={22} /></button>
  </header>
  <UpdateBar />
  {#if stale}<div class="banner" role="status">{$t('staleData')}</div>{/if}
  {#if !online}<div class="banner" role="status">{$t('offline')}</div>{/if}
  <main class="stage">
    {#if data}
      <MapView {data} />
      <BottomSheet>
        {#if $route.name === 'plan'}
          <Planner {data} />
        {:else if $route.name === 'stop'}
          <StopBoard {data} stopId={$route.stopId} date={$route.date} time={$route.time} />
        {:else if $route.name === 'line'}
          <LineView {data} number={$route.number} dir={$route.dir} stopId={$route.stopId} date={$route.date} />
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
          <Home {data} date={$route.name === 'home' ? $route.date : undefined} time={$route.name === 'home' ? $route.time : undefined} />
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
  .search { flex: 1; display: flex; align-items: center; gap: 10px; min-height: 48px; text-align: left; background: var(--accent); color: var(--accent-fg); border-radius: 14px; padding: 0 16px; font-weight: 700; font-size: 1.05rem; }
  .icon { width: 48px; display: grid; place-items: center; border-radius: 14px; background: var(--chip); color: var(--fg); }
  .stage { position: relative; flex: 1; overflow: hidden; }
  .center { display: grid; place-items: center; align-content: center; gap: 12px; height: 100%; }
</style>
