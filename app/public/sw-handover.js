// One-time handover from the old auto-updating worker: the first worker that waits for "Načíst" takes over at once
// and reloads the open pages into the new version; every later version waits in the update bar.
let handover = false;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.has('rb-prompt-v1').then((has) => {
    if (has) return undefined;
    handover = true;
    return self.skipWaiting();
  }));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    await caches.open('rb-prompt-v1');
    if (!handover) return;
    await self.clients.claim();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
  })());
});
