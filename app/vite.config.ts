import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ricany-bus/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
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
        // the beta lives at /v2/ and is precached as its own page: never answer it with the classic app's index.html
        navigateFallbackDenylist: [/\/v2\//],
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
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), v2: resolve(__dirname, 'v2/index.html') } } },
});
