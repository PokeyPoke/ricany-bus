<script lang="ts">
  /** A bus in its line's colour with the line number large across its front, centred on (x, y) and drawn `k` times its 48×54 design size. */
  let { x, y, k, color, text, number, waiting = false }: { x: number; y: number; k: number; color: string; text: string; number: string; waiting?: boolean } = $props();
  const size = $derived(number.length > 1 ? 25 : 32);
</script>

<!-- a bus waiting to start its trip is drawn hollow (opaque, so the diagram underneath does not show through) -->
<g transform={`translate(${x} ${y}) scale(${k}) translate(-24 -27)`}>
  <!-- white halo, so it reads over the lines -->
  <g fill="#fff" stroke="#fff" stroke-width="5" stroke-linejoin="round">
    <rect x="5" y="3" width="38" height="42" rx="9" />
    <rect x="9" y="40" width="10" height="10" rx="4" /><rect x="29" y="40" width="10" height="10" rx="4" />
  </g>
  <g fill={color}>
    <rect x="9" y="40" width="10" height="10" rx="4" /><rect x="29" y="40" width="10" height="10" rx="4" />
    <rect x="5" y="3" width="38" height="42" rx="9" />
  </g>
  {#if waiting}<rect x="9" y="7" width="30" height="34" rx="6" fill="#fff" />{/if}
  <!-- baseline placed by hand (dominant-baseline is unreliable once the group is scaled down) -->
  <text x="24" y={25 + size * 0.36} text-anchor="middle" fill={waiting ? color : text} letter-spacing="-0.5"
    font-family="system-ui, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size={size}>{number}</text>
</g>
