import './app.css';
import { mount, unmount } from 'svelte';
import { LINE_STYLE, type FreeRouteId } from '@rb/shared';
import { initUpdates } from './lib/update';
import { mapMode, type MapMode } from './lib/mapMode';
import { SCHEMA_COLORS } from './v3/schema';
import AppV2 from './v2/AppV2.svelte';

// PID's line colours on the street map; on the line diagram the diagram's own (they differ), so a badge matches what is drawn
const PID = Object.fromEntries(Object.entries(LINE_STYLE).map(([id, s]) => [id, { color: s.color, text: s.text }]));
function colours(mode: MapMode) {
  for (const id of Object.keys(SCHEMA_COLORS) as FreeRouteId[]) Object.assign(LINE_STYLE[id], mode === 'schema' ? SCHEMA_COLORS[id] : PID[id]);
}

document.body.classList.add('v2');
// the colours are read once by every badge, so switching the map remounts the app (the screen itself is in the URL)
let app: ReturnType<typeof mount> | null = null;
let shown: MapMode | null = null;
mapMode.subscribe((mode) => {
  if (mode === shown) return;
  shown = mode;
  colours(mode);
  document.body.classList.toggle('v3', mode === 'schema');
  if (app) unmount(app);
  app = mount(AppV2, { target: document.getElementById('app')! });
});

initUpdates();
