import { DETOUR, WALK_SPEED_MPS, BIKE_SPEED_MPS } from './constants';

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const walkSec = (m: number) => Math.round((m * DETOUR) / WALK_SPEED_MPS);
export const bikeSec = (m: number) => Math.round((m * DETOUR) / BIKE_SPEED_MPS);
