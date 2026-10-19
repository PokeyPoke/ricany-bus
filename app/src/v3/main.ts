import '../app.css';
import { mount } from 'svelte';
import { LINE_STYLE, type FreeRouteId } from '@rb/shared';
import { initUpdates } from '../lib/update';
import { SCHEMA_COLORS } from './schema';
import AppV3 from './AppV3.svelte';

// badges in the diagram's colours (they differ from PID's), so a line looks the same in the list and on the diagram
for (const [id, c] of Object.entries(SCHEMA_COLORS)) Object.assign(LINE_STYLE[id as FreeRouteId], c);

document.body.classList.add('v2', 'v3');
mount(AppV3, { target: document.getElementById('app')! });

initUpdates();
