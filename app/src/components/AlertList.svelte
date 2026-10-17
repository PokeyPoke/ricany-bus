<script lang="ts">
  import type { FreeRouteId } from '@rb/shared';
  import { alerts, activeAlerts, useAlerts } from '../lib/live';
  import { now } from '../lib/ui';
  import { t, lang } from '../lib/i18n';
  import LineBadge from './LineBadge.svelte';

  /** only alerts naming one of these lines (all free-line alerts when omitted) */
  let { routes }: { routes?: FreeRouteId[] } = $props();
  $effect(() => useAlerts());
  const list = $derived(activeAlerts($alerts, Date.now() + 0 * $now.sec, routes));
  let open = $state<Record<string, boolean>>({});
  const header = (a: (typeof list)[number]) => ($lang === 'en' && a.headerEn) || a.header;
  const body = (a: (typeof list)[number]) => ($lang === 'en' && a.descriptionEn) || a.description;
</script>

{#if list.length}
  <ul class="alerts" aria-label={$t('alerts')}>
    {#each list as a (a.id)}
      <li>
        <button class="alert" aria-expanded={!!open[a.id]} onclick={() => (open[a.id] = !open[a.id])}>
          <span class="icon">⚠️</span>
          <span class="badges">{#each a.routes as r (r)}<LineBadge routeId={r} />{/each}</span>
          <span class="h">{header(a) || $t('alerts')}</span>
        </button>
        {#if open[a.id]}
          <div class="detail">
            {#if body(a)}<p>{body(a)}</p>{/if}
            {#if a.url}<a href={a.url} target="_blank" rel="noopener">{$t('alertMore')}</a>{/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .alerts { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 6px; }
  .alert { display: flex; gap: 8px; align-items: center; width: 100%; min-height: 44px; text-align: left; padding: 8px 10px; border-radius: 10px; background: var(--warn-bg); color: inherit; }
  .badges { display: inline-flex; gap: 4px; }
  .h { font-weight: 700; }
  .detail { padding: 6px 10px 2px; white-space: pre-line; }
  .detail p { margin: 0 0 6px; }
</style>
