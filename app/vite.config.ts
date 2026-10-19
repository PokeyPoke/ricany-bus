import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ricany-bus/',
  plugins: [
    svelte(),
    VitePWA({
      // a new version waits until the user taps "load" in the update bar (lib/update.ts registers the worker)
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*'],
      manifest: {
        name: 'Říčany zdarma — MHD',
        short_name: 'Říčany MHD',
        description: 'Spojení jen bezplatnými autobusy MHD Říčany a Nextbike',
        lang: 'cs',
        theme_color: '#0b5cad',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/ricany-bus/',
        scope: '/ricany-bus/',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globIgnores: ['og.png'],
        // the classic app and the old beta addresses are their own pages: never answer them with the app's index.html
        navigateFallbackDenylist: [/\/(classic|v[23])\//],
        // take over open pages as soon as a worker activates, so "load" (skip waiting) reloads into the new version
        clientsClaim: true,
        importScripts: ['sw-handover.js'],
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}', 'data/*.json'],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.includes('/data/') && url.pathname.endsWith('.json'), handler: 'StaleWhileRevalidate', options: { cacheName: 'rb-data' } },
          { urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org', handler: 'CacheFirst', options: { cacheName: 'rb-tiles', expiration: { maxEntries: 3000, maxAgeSeconds: 7 * 86400 } } },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  // the classic app and the beta (sentence) version, side by side from the same code and data
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), classic: resolve(__dirname, 'classic/index.html'), v2: resolve(__dirname, 'v2/index.html'), v3: resolve(__dirname, 'v3/index.html') } } },
});
