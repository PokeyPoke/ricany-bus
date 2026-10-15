export const FREE_ROUTE_IDS = ['L1731', 'L1732', 'L1733', 'L1734', 'L1735', 'L1736', 'L1737'] as const;
export type FreeRouteId = (typeof FREE_ROUTE_IDS)[number];

/** Display order follows FREE_ROUTE_IDS order sorted by number: 1,2,3,7,9,91,92. */
export const LINE_STYLE: Record<FreeRouteId, { number: string; color: string; text: string }> = {
  L1731: { number: '1', color: '#E4002B', text: '#FFFFFF' },
  L1732: { number: '2', color: '#0072CE', text: '#FFFFFF' },
  L1733: { number: '3', color: '#00965E', text: '#FFFFFF' },
  L1736: { number: '7', color: '#F2A900', text: '#000000' },
  L1737: { number: '9', color: '#7A3E9D', text: '#FFFFFF' },
  L1734: { number: '91', color: '#4A5560', text: '#FFFFFF' },
  L1735: { number: '92', color: '#A05A2C', text: '#FFFFFF' },
};
export const LINE_ORDER: FreeRouteId[] = ['L1731', 'L1732', 'L1733', 'L1736', 'L1737', 'L1734', 'L1735'];

export const NEXTBIKE_CITY_UID = 736;
export const RIC_CENTER = { lat: 49.9918, lon: 14.6556 };
/** minLon, minLat, maxLon, maxLat */
export const RIC_BBOX = [14.58, 49.95, 14.74, 50.03] as const;

export const WALK_SPEED_MPS = 4.5 / 3.6;
export const BIKE_SPEED_MPS = 14 / 3.6;
export const DETOUR = 1.3;
export const MAX_ACCESS_WALK_M = 1200;
export const MAX_TRANSFER_WALK_M = 400;
export const MIN_TRANSFER_SEC = 60;
export const BIKE_RENT_SEC = 60;
export const BIKE_RETURN_SEC = 60;
export const MAX_RIDES = 3;
