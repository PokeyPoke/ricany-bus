import { userPos } from './ui';

export function getLocation(timeoutMs = 10_000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const v = { lat: p.coords.latitude, lon: p.coords.longitude }; userPos.set(v); resolve(v); },
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
