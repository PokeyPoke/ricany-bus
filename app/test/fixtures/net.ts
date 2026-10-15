import type { StopRec, TimetableFile, PatternRec, TripRec } from '@rb/shared';

export const H = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

// Six stops on one meridian, ~1.56 km apart (beyond 1.2 km walking), except S3 which is 167 m from S2.
const LATS = [49.99, 50.004, 50.018, 50.0195, 50.033, 50.047];
export const stops: StopRec[] = LATS.map((lat, i) => ({
  id: 'S' + i, name: 'S' + i, platform: 'A', lat, lon: 14.65, lines: [], transfers: [],
}));
stops[2].transfers.push([3, 174]);
stops[3].transfers.push([2, 174]);

const trip = (id: string, service: string, start: number, offsets: number[]): TripRec => ({
  id, service, arr: offsets.map((o) => start + o), dep: offsets.map((o) => start + o),
});

export const patterns: PatternRec[] = [
  // P0: S0 → S1 → S2
  { routeId: 'L1731', directionId: 0, headsign: 'S2', stops: [0, 1, 2], seq: [1, 2, 3],
    trips: [trip('a1', 'W', H(8, 0), [0, 300, 600]), trip('a2', 'W', H(8, 30), [0, 300, 600])] },
  // P1: S3 → S4 (walk transfer from S2)
  { routeId: 'L1733', directionId: 0, headsign: 'S4', stops: [3, 4], seq: [1, 2],
    trips: [trip('b1', 'W', H(8, 15), [0, 360]), trip('b2', 'W', H(8, 45), [0, 360])] },
  // P2: S2 → S5 (c1 leaves 30 s after a1 arrives: too tight for the 60 s same-stop rule)
  { routeId: 'L1732', directionId: 0, headsign: 'S5', stops: [2, 5], seq: [1, 2],
    trips: [trip('c1', 'W', H(8, 10, 30), [0, 480]), trip('c2', 'W', H(8, 25), [0, 480])] },
  // P3: slow direct S0 → S5
  { routeId: 'L1737', directionId: 0, headsign: 'S5', stops: [0, 5], seq: [1, 2],
    trips: [trip('d1', 'W', H(8, 0), [0, 3600])] },
  // P4: after-midnight trip belonging to the previous service day
  { routeId: 'L1736', directionId: 0, headsign: 'S2', stops: [1, 2], seq: [1, 2],
    trips: [trip('n1', 'N', H(24, 10), [0, 300])] },
];

export const timetable: TimetableFile = {
  patterns,
  servicesByDate: { '20261018': ['N'], '20261019': ['W'], '20261020': ['W'] },
};
