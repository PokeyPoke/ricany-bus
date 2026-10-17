import { get } from 'svelte/store';
import { userPos, type UserPos } from './ui';

/** after the first fix, keep listening this long for a better one (phones answer first from cell/Wi-Fi, km off, then GPS) */
const REFINE_MS = 2 * 60_000;
/** good enough: stop listening */
const GOOD_M = 25;

let watchId: number | null = null;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

const toPos = (p: GeolocationPosition): UserPos => ({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: p.timestamp });

/** a newer fix replaces the shown one when it is about as precise or better, or the shown one is getting old */
export function better(next: UserPos, cur: UserPos | null): boolean {
  if (!cur) return true;
  return next.acc <= cur.acc * 1.5 || next.acc <= 50 || next.at - cur.at > 60_000;
}

function stopRefine() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  clearTimeout(stopTimer);
}

function refine() {
  if (watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const v = toPos(p);
      if (better(v, get(userPos))) userPos.set(v);
      if (v.acc <= GOOD_M) stopRefine();
    },
    () => stopRefine(),
    { enableHighAccuracy: true, maximumAge: 0, timeout: REFINE_MS },
  );
  stopTimer = setTimeout(stopRefine, REFINE_MS);
}

export function getLocation(timeoutMs = 10_000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const v = toPos(p);
        userPos.set(v);
        resolve(v);
        // the first answer is often the coarse one: keep improving the dot while the app is open
        if (v.acc > GOOD_M) refine();
      },
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
