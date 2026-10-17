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

/** the new version keeps its chosen day and time across screens; null in the classic version */
let rewrite: ((next: Route, cur: Route) => Route) | null = null;
export function setRouteRewrite(f: typeof rewrite): void { rewrite = f; }

/** `exact`: the route as given (the sentence bar's own edits), without the rewrite */
export function navigate(r: Route, replace = false, exact = false): void {
  if (rewrite && !exact) r = rewrite(r, parseHash(curHash));
  const h = formatRoute(r);
  if (replace) {
    history.replaceState(history.state, '', h);
    curHash = h;
    store.set(parseHash(h));
  } else if (location.hash !== h) {
    location.hash = h;
  }
}
