<script lang="ts">
  import { LINE_STYLE, type FreeRouteId } from '@rb/shared';
  /** outline: a line that is not running (its colour as a border, readable dark/light text inside) */
  let { routeId, outline = false }: { routeId: FreeRouteId; outline?: boolean } = $props();
  const s = $derived(LINE_STYLE[routeId]);
</script>

{#if outline}
  <span class="badge outline" style:border-color={s.color}>{s.number}</span>
{:else}
  <span class="badge" style:background={s.color} style:color={s.text}>{s.number}</span>
{/if}

<style>
  .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 26px; padding: 0 7px; border-radius: 7px; font-weight: 800; font-size: 0.95rem; }
  .outline { border: 2.5px solid; color: var(--muted); background: transparent; }
</style>
