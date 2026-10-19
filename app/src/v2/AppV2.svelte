<script lang="ts">
  import { onMount } from 'svelte';
  import UpdateBar from '../components/UpdateBar.svelte';
  import { pragueNow } from '@rb/shared';
  import Home from '../sheets/Home.svelte';
  import Planner from '../sheets/Planner.svelte';
  import StopBoard from '../sheets/StopBoard.svelte';
  import BikeStation from '../sheets/BikeStation.svelte';
  import BusSheet from '../sheets/BusSheet.svelte';
  import FromSheet from '../sheets/FromSheet.svelte';
  import RideSheet from '../sheets/RideSheet.svelte';
  import About from '../sheets/About.svelte';
  import LineView from '../sheets/LineView.svelte';
  import BottomSheet from '../components/BottomSheet.svelte';
  import MapView from '../map/MapView.svelte';
  import SchemaView from '../v3/SchemaView.svelte';
  import MapModeSwitch from '../components/MapModeSwitch.svelte';
  import { mapMode } from '../lib/mapMode';
  import SentenceBar from './SentenceBar.svelte';
  import { route, navigate, setRouteRewrite } from '../lib/nav';
  import { stopTap } from '../lib/ui';
  import { carryWhen, tapStop } from './sentence';
  import { get } from 'svelte/store';
  import { t } from '../lib/i18n';
  import { loadData, daysLeft, type AppData } from '../lib/data';

  let data = $state.raw<AppData | null>(null); // raw: large, immutable, and must be structured-cloneable for the router worker
  let failed = $state(false);
  let online = $state(navigator.onLine);

  function load() {
    failed = false;
    loadData().then((d) => (data = d)).catch(() => (failed = true));
  }
  onMount(() => {
    load();
    // links between screens keep the chosen day and time; a stop tapped on the map fills the sentence
    setRouteRewrite(carryWhen);
    stopTap.set((id) => { if (data) navigate(tapStop(get(route), data, id, get(t)('myLocation')), false, true); });
    const on = () => (online = navigator.onLine);
    addEventListener('online', on);
    addEventListener('offline', on);
    return () => { removeEventListener('online', on); removeEventListener('offline', on); };
  });
  const stale = $derived(data ? daysLeft(data.meta, pragueNow().date) < 3 : false);
</script>

<div class="app">
  <!-- every screen is one sentence: "Z … do … · kdy"; editing a word is the only navigation -->
  {#if data}<SentenceBar {data} />{:else}<header class="topbar"><strong>Říčany zdarma</strong></header>{/if}
  <UpdateBar />
  {#if stale}<div class="banner" role="status">{$t('staleData')}</div>{/if}
  {#if !online}<div class="banner" role="status">{$t('offline')}</div>{/if}
  <main class="stage">
    {#if data}
      {#if $mapMode === 'schema'}<SchemaView {data} />{:else}<MapView {data} />{/if}
      <MapModeSwitch />
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
  .topbar { min-height: 48px; align-items: center; display: flex; gap: 8px; padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top)); background: var(--bg); box-shadow: var(--shadow); z-index: 10; }
  .stage { position: relative; flex: 1; overflow: hidden; }
  .center { display: grid; place-items: center; align-content: center; gap: 12px; height: 100%; }
</style>
