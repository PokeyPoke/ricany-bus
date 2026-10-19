<script lang="ts">
  import { t } from '../lib/i18n';
  import { mapMode } from '../lib/mapMode';
</script>

<!-- street map or the city's line diagram -->
<div class="mode" role="group" aria-label={$t('mapModeLabel')}>
  <button aria-pressed={$mapMode === 'map'} onclick={() => mapMode.set('map')}>{$t('mapModeMap')}</button>
  <button aria-pressed={$mapMode === 'schema'} onclick={() => mapMode.set('schema')}>{$t('mapModeSchema')}</button>
</div>

<style>
  .mode { position: absolute; left: 10px; top: 10px; z-index: 5; display: flex; padding: 3px; gap: 2px; border-radius: 12px; background: var(--bg); box-shadow: var(--shadow); }
  button { min-height: 38px; padding: 0 12px; border-radius: 9px; font-weight: 700; font-size: 0.9rem; color: var(--muted); }
  button[aria-pressed='true'] { background: var(--accent); color: var(--accent-fg, #fff); }
</style>
