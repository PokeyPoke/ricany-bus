import './app.css';
import { mount } from 'svelte';
import { initUpdates } from './lib/update';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

initUpdates();
