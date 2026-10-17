import { writable } from 'svelte/store';
import { registerSW } from 'virtual:pwa-register';

/** a new version is downloaded and waiting: the bar offers to load it */
export const updateReady = writable(false);
let apply: (reload?: boolean) => Promise<void> = async () => location.reload();

/** register the service worker; look for a new version on start, whenever the app comes back to the screen, and every 30 min */
export function initUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  apply = registerSW({
    onNeedRefresh: () => updateReady.set(true),
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', check);
      setInterval(check, 30 * 60_000);
    },
  });
}

/** switch to the waiting version and reload once it has taken over (the library only reloads for updates it found itself) */
export function applyUpdate(): void {
  let done = false;
  const reload = () => { if (!done) { done = true; location.reload(); } };
  navigator.serviceWorker?.addEventListener('controllerchange', reload);
  void apply(true);
  setTimeout(reload, 4000); // nothing was waiting after all: a plain reload still fetches the latest
}
