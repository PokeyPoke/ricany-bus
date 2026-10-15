import type { FreeRouteId } from '@rb/shared';

export interface PlaceRef { lat: number; lon: number; name: string }
export interface BikeStation { uid: number; name: string; lat: number; lon: number; bikes: number; freeRacks: number }

export type Leg =
  | { kind: 'walk'; from: PlaceRef; to: PlaceRef; depart: number; arrive: number; meters: number }
  | {
      kind: 'bus'; routeId: FreeRouteId; headsign: string; tripId: string; serviceDate: string; pattern: number;
      boardPos: number; alightPos: number; boardSeq: number; alightSeq: number; from: number; to: number;
      depart: number; arrive: number; stopCount: number;
    }
  | { kind: 'bike'; from: BikeStation; to: BikeStation; depart: number; arrive: number; meters: number };

export interface Itinerary { date: string; depart: number; arrive: number; rides: number; free: boolean; legs: Leg[] }
export interface PlanRequest { from: PlaceRef; to: PlaceRef; mode: 'dep' | 'arr'; date: string; sec: number }
export interface PlanResult { free: Itinerary[]; bike: Itinerary[]; walk: Itinerary | null; nearOrigin: number; nearDest: number }
export interface StopAccess { stop: number; sec: number; legs?: (start: number) => Leg[] }
