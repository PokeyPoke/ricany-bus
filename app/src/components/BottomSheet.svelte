<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n';

  let { children }: { children: Snippet } = $props();
  const SNAPS = [0.28, 0.55, 0.9];
  let snap = $state(1);
  let dragH = $state<number | null>(null);
  let startY = 0;
  let startH = 0;
  let sheet: HTMLElement;

  function down(e: PointerEvent) {
    startY = e.clientY;
    startH = sheet.getBoundingClientRect().height;
    dragH = startH;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (dragH === null) return;
    dragH = Math.min(window.innerHeight * 0.95, Math.max(80, startH + (startY - e.clientY)));
  }
  function up() {
    if (dragH === null) return;
    const f = dragH / window.innerHeight;
    snap = SNAPS.reduce((bi, s, i) => (Math.abs(s - f) < Math.abs(SNAPS[bi] - f) ? i : bi), 0);
    dragH = null;
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') snap = Math.min(SNAPS.length - 1, snap + 1);
    if (e.key === 'ArrowDown') snap = Math.max(0, snap - 1);
  }
</script>

<section class="sheet" bind:this={sheet} style:height={dragH !== null ? `${dragH}px` : `${SNAPS[snap] * 100}%`} class:dragging={dragH !== null}>
  <div
    class="handle" role="slider" tabindex="0" aria-label={$t('resize')}
    aria-valuemin={0} aria-valuemax={SNAPS.length - 1} aria-valuenow={snap}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key}
  ><span></span></div>
  <div class="content">{@render children()}</div>
</section>

<style>
  .sheet {
    position: absolute; left: 0; right: 0; bottom: 0; z-index: 5;
    display: flex; flex-direction: column;
    background: var(--bg); border-radius: 16px 16px 0 0; box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.18);
    transition: height 0.2s ease;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .sheet.dragging { transition: none; }
  .handle { display: flex; justify-content: center; padding: 10px; cursor: grab; touch-action: none; min-height: 28px; }
  .handle span { width: 40px; height: 5px; border-radius: 3px; background: var(--muted); opacity: 0.6; }
  .content { flex: 1; overflow-y: auto; padding: 0 16px 16px; overscroll-behavior: contain; }
  @media (min-width: 900px) {
    .sheet { top: 0; right: auto; width: 400px; height: auto !important; border-radius: 0; box-shadow: var(--shadow); }
    .handle { display: none; }
    .content { padding-top: 12px; }
  }
</style>
