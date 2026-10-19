<script lang="ts">
  import { darken, signFontPx } from '../map/busStyle';

  /** The street map's front-view bus (busIcons.ts) as SVG, centred on (x, y) and drawn `k` times its 48×54 design size. */
  let { x, y, k, color, number, waiting = false }: { x: number; y: number; k: number; color: string; number: string; waiting?: boolean } = $props();
  const edge = $derived(darken(color, 0.28));
  const uid = $props.id();
</script>

<g transform={`translate(${x} ${y}) scale(${k}) translate(-24 -27)`} opacity={waiting ? 0.45 : 1}>
  <defs>
    <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9f1ff" /><stop offset="1" stop-color="#9fd3f2" /></linearGradient>
  </defs>
  <!-- white halo around body, wheels and mirrors -->
  <g fill="#fff" stroke="#fff" stroke-width="5" stroke-linejoin="round">
    <rect x="7" y="3" width="34" height="42" rx="11" />
    <rect x="10" y="41" width="9" height="9" rx="4" /><rect x="29" y="41" width="9" height="9" rx="4" />
    <rect x="3" y="26" width="7" height="8" rx="3.5" /><rect x="38" y="26" width="7" height="8" rx="3.5" />
  </g>
  <!-- wheels -->
  <rect x="10" y="41" width="9" height="9" rx="4" fill="#2a3036" /><rect x="29" y="41" width="9" height="9" rx="4" fill="#2a3036" />
  <!-- mirrors -->
  <rect x="3" y="26" width="7" height="8" rx="3.5" fill={edge} /><rect x="38" y="26" width="7" height="8" rx="3.5" fill={edge} />
  <!-- body -->
  <rect x="7" y="3" width="34" height="42" rx="11" fill={color} stroke={edge} stroke-width="1.5" />
  <!-- sign with the line number -->
  <rect x="11" y="6.5" width="26" height="16" rx="5" fill="#fff" stroke={edge} stroke-width="1" />
  <!-- baseline placed by hand (dominant-baseline is unreliable once the group is scaled down) -->
  <text x="24" y={15 + (signFontPx(number) + 1) * 0.36} text-anchor="middle" fill="#16202b"
    font-family="system-ui, 'Helvetica Neue', Arial, sans-serif" font-weight="800" font-size={signFontPx(number) + 1}>{number}</text>
  <!-- windscreen, headlights, bumper -->
  <rect x="11" y="25" width="26" height="12" rx="5" fill={`url(#glass-${uid})`} stroke={edge} stroke-width="1" />
  <circle cx="15" cy="41" r="3.2" fill="#fff3b0" stroke={edge} stroke-width="1" /><circle cx="33" cy="41" r="3.2" fill="#fff3b0" stroke={edge} stroke-width="1" />
  <path d="M 28.2 41.7 A 6 6 0 0 1 19.8 41.7" fill="none" stroke={edge} stroke-width="1.8" stroke-linecap="round" />
</g>
