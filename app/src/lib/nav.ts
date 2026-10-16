import { writable } from 'svelte/store';
import { formatRoute, parseHash, type Route } from './hashRoute';

/** hash before the current one, so detail views can pop back via history when they were pushed from it */
export let lastHash = '';
let curHash = location.hash;
const store = writable<Route>(parseHash(location.hash));
addEventListener('hashchange', () => {
  lastHash = curHash;
  curHash = location.hash;
  store.set(parseHash(location.hash));
});

export const route = { subscribe: store.subscribe };

export function navigate(r: Route, replace = false): void {
  const h = formatRoute(r);
  if (replace) {
    history.replaceState(history.state, '', h);
    curHash = h;
    store.set(parseHash(h));
  } else if (location.hash !== h) {
    location.hash = h;
  }
}
