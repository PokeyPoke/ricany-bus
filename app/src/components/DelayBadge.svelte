<script lang="ts">
  import { t } from '../lib/i18n';
  let { sec, live }: { sec: number | null; live: boolean } = $props();
  const min = $derived(sec == null ? null : Math.round(sec / 60));
</script>

{#if !live}
  <span class="nolive">{$t('noLive')}</span>
{:else if min === 0}
  <!-- on time: a quiet live dot instead of "±0 min" on every row -->
  <span class="ontime" title={$t('onTime')}><span class="sr">{$t('onTime')}</span></span>
{:else if min != null}
  <span class="d" class:late={min > 0} class:early={min < 0}>{min > 0 ? `+${min}` : `−${-min}`} min</span>
{/if}

<style>
  .d { font-size: 0.8rem; font-weight: 700; color: var(--ok); margin-left: 4px; }
  .d.late { color: var(--bad); }
  .d.early { color: var(--warn); }
  .ontime { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); margin-left: 6px; vertical-align: 0.15em; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .nolive { font-size: 0.75rem; color: var(--muted); margin-left: 4px; }
</style>
