<script lang="ts" module>
  /** 24×24 line icons (stroke = currentColor), drawn for this app so they look the same on every phone. */
  const PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.6-4.6"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16.5v-5"/><path d="M12 8h.01"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    layers: '<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="m2.5 12.5 9.5 5 9.5-5"/><path d="m2.5 17 9.5 5 9.5-5"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    swap: '<path d="M7 20V4"/><path d="m3 8 4-4 4 4"/><path d="M17 4v16"/><path d="m13 16 4 4 4-4"/>',
    flip: '<path d="M4 7h16"/><path d="m16 3 4 4-4 4"/><path d="M20 17H4"/><path d="m8 13-4 4 4 4"/>',
    stop: '<rect x="6.5" y="2.5" width="11" height="8" rx="2"/><path d="M12 10.5V21"/><path d="M9 21h6"/><path d="M9.5 6.5h5"/>',
    walk: '<circle cx="13.5" cy="4" r="2"/><path d="m10 21 2.2-6.2"/><path d="m16 21-3.8-6.2.8-4.8"/><path d="m7 12.5 2-3.8 4 1.3 2.5 3"/>',
    bike: '<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17 9 9h6l3.5 8"/><path d="M12 17 9 9"/><path d="M14 5.5h2.5L15 9"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16"/><path d="M8 14.5h.01M16 14.5h.01"/><path d="M7 18v2.5M17 18v2.5"/>',
    warn: '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    access: '<circle cx="12.5" cy="4" r="2"/><path d="M12 7.5v6h5l2.5 5.5"/><path d="M12 10h4"/><path d="M8.5 11.2A5.5 5.5 0 1 0 15.6 19"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    flag: '<path d="M5 22V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    run: '<circle cx="14" cy="4" r="2"/><path d="m7 21 3-6 3 2v4"/><path d="m5 11 3-3h5l3 3 3 1"/><path d="M10 15l2-6"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 20, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
  {@html PATHS[name]}
</svg>

<style>
  .icon { display: inline-block; flex: none; vertical-align: -0.2em; }
</style>
