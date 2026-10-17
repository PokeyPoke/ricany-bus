<script lang="ts">
  import { t } from '../lib/i18n';
  let { p }: { p: string } = $props();
</script>

{#if p}<span class="plat" title={$t('platform', { p })}><span class="sr">{$t('platform', { p })}</span><span aria-hidden="true">{p}</span></span>{/if}

<style>
  .plat { display: inline-grid; place-items: center; min-width: 1.35em; height: 1.35em; padding: 0 3px; margin-left: 6px; border: 1.5px solid var(--muted); border-radius: 5px; font-size: 0.72rem; font-weight: 800; color: var(--muted); vertical-align: 0.12em; line-height: 1; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
