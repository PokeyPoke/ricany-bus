import '../app.css';
import { mount } from 'svelte';
import { initUpdates } from '../lib/update';
import AppV2 from './AppV2.svelte';

document.body.classList.add('v2');
mount(AppV2, { target: document.getElementById('app')! });

initUpdates();
