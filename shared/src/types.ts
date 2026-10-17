import type { FreeRouteId } from './constants';

export interface StopRec {
  id: string;
  name: string; // "Masarykovo nám." (prefix "Říčany," stripped)
  platform: string;
  lat: number;
  lon: number;
  lines: FreeRouteId[];
  /** [target stop index, walking seconds] for stops ≤ 400 m away */
  transfers: [number, number][];
  /** index into groups */
  group: number;
  /** GTFS wheelchair_boarding when known: 1 accessible, 2 not accessible (absent = unknown) */
  access?: 1 | 2;
}
export interface StopsFile { stops: StopRec[] }

/** Platforms sharing a display name. id = id of the first platform (ids ascending). */
export interface StopGroup {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** stop indices, sorted by stop id */
  platforms: number[];
  lines: FreeRouteId[];
}
export interface GroupsFile { groups: StopGroup[] }

export interface LineDirection {
  directionId: number;
  headsign: string;
  stops: number[];
  /** [lon, lat] */
  shape: [number, number][];
}
export interface LineRec {
  routeId: FreeRouteId;
  number: string;
  color: string;
  text: string;
  longName: string;
  directions: LineDirection[];
}
export interface LinesFile { lines: LineRec[] }

export interface TripRec {
  id: string;
  service: string;
  /** seconds after service-day midnight, one per pattern stop */
  arr: number[];
  dep: number[];
}
export interface PatternRec {
  routeId: FreeRouteId;
  directionId: number;
  headsign: string;
  stops: number[];
  /** GTFS stop_sequence per pattern position (needed to match GTFS-RT updates) */
  seq: number[];
  /** sorted by dep[0] */
  trips: TripRec[];
}
export interface TimetableFile {
  patterns: PatternRec[];
  /** YYYYMMDD → active service_ids */
  servicesByDate: Record<string, string[]>;
}
export interface MetaFile {
  feedStart: string;
  feedEnd: string;
  generatedAt: string;
  tripCount: number;
}

export interface TripDelay {
  startDate: string;
  /** trip-level fallback delay in seconds */
  delay: number;
  /** stop_sequence → departure (or arrival) delay in seconds */
  stops: Record<number, number>;
}
export interface DelaysResponse {
  /** feed header timestamp, unix seconds */
  generatedAt: number;
  trips: Record<string, TripDelay>;
}

export interface Vehicle {
  id: string; label: string; tripId: string; routeId: FreeRouteId; startDate: string;
  lat: number; lon: number; bearing: number | null; speed: number | null; stopSeq: number | null;
  /** unix seconds of the position */
  ts: number;
}
export interface PositionsResponse { generatedAt: number; vehicles: Vehicle[] }
