<script lang="ts">
  import { t } from '../lib/i18n';
  let { sec, live }: { sec: number | null; live: boolean } = $props();
  const min = $derived(sec == null ? null : Math.round(sec / 60));
</script>

{#if !live}
  <span class="nolive">{$t('noLive')}</span>
{:else if min != null}
  <span class="d" class:late={min > 0} class:early={min < 0}>{min > 0 ? `+${min}` : min < 0 ? `−${-min}` : '±0'} min</span>
{/if}

<style>
  .d { font-size: 0.8rem; font-weight: 700; color: var(--ok); margin-left: 4px; }
  .d.late { color: var(--bad); }
  .d.early { color: var(--warn); }
  .nolive { font-size: 0.75rem; color: var(--muted); margin-left: 4px; }
</style>
