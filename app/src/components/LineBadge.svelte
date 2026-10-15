<script lang="ts">
  import { LINE_STYLE, type FreeRouteId } from '@rb/shared';
  let { routeId }: { routeId: FreeRouteId } = $props();
  const s = $derived(LINE_STYLE[routeId]);
</script>

<span class="badge" style:background={s.color} style:color={s.text}>{s.number}</span>

<style>
  .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 26px; padding: 0 7px; border-radius: 7px; font-weight: 800; font-size: 0.95rem; }
</style>
