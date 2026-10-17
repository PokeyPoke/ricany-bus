<script lang="ts">
  import { updateReady, applyUpdate } from '../lib/update';
  import { t } from '../lib/i18n';
  let loading = $state(false);
</script>

{#if $updateReady}
  <div class="update" role="status">
    <span>{$t('updateReady')}</span>
    <button onclick={() => { loading = true; applyUpdate(); }} aria-busy={loading}>{$t('updateLoad')}</button>
  </div>
{/if}

<style>
  .update { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 12px; background: var(--accent); color: var(--accent-fg); font-size: 0.95rem; }
  .update button { min-height: 40px; padding: 0 14px; border-radius: 10px; background: var(--accent-fg); color: var(--accent); font-weight: 700; }
</style>
