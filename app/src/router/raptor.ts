import { MAX_RIDES, MIN_TRANSFER_SEC } from '@rb/shared';
import type { Network, NetPattern } from './network';
import type { StopAccess } from './types';

export interface RideStep { kind: 'ride'; p: number; trip: number; boardPos: number; alightPos: number }
export interface FootStep { kind: 'foot'; from: number; to: number; sec: number }
export interface Journey {
  rides: number; access: StopAccess; egress: StopAccess; steps: (RideStep | FootStep)[];
  arrive: number; firstDepart: number;
}

type Prev =
  | { kind: 'access'; a: StopAccess }
  | { kind: 'ride'; p: number; trip: number; boardPos: number; alightPos: number; boardStop: number }
  | { kind: 'foot'; from: number; sec: number };

/** Index of the trip with the smallest dep[pos] ≥ t (linear scan: robust to overtaking), or −1. */
function earliestTrip(pat: NetPattern, pos: number, t: number): number {
  let best = -1;
  for (let i = 0; i < pat.trips.length; i++) {
    const d = pat.trips[i].dep[pos];
    if (d >= t && (best < 0 || d < pat.trips[best].dep[pos])) best = i;
  }
  return best;
}

export function raptor(net: Network, access: StopAccess[], egress: StopAccess[], departSec: number, maxRides = MAX_RIDES): Journey[] {
  const n = net.stops.length;
  const tau: Float64Array[] = [];
  const prev: (Prev | undefined)[][] = [];
  const byRide: Uint8Array[] = [];
  const best = new Float64Array(n).fill(Infinity);
  const newRound = () => { tau.push(new Float64Array(n).fill(Infinity)); prev.push(new Array(n)); byRide.push(new Uint8Array(n)); };

  newRound();
  let marked = new Set<number>();
  for (const a of access) {
    const t = departSec + a.sec;
    if (t < tau[0][a.stop]) { tau[0][a.stop] = t; best[a.stop] = Math.min(best[a.stop], t); prev[0][a.stop] = { kind: 'access', a }; marked.add(a.stop); }
  }

  let bestDest = Infinity;
  const journeys: Journey[] = [];
  for (let k = 1; k <= maxRides && marked.size; k++) {
    newRound();
    const queue = new Map<number, number>();
    for (const s of marked) {
      for (const { p, pos } of net.stopPatterns[s]) {
        const q = queue.get(p);
        if (q === undefined || pos < q) queue.set(p, pos);
      }
    }
    marked = new Set();
    const rideMarked: number[] = [];

    for (const [pi, startPos] of queue) {
      const pat = net.patterns[pi];
      let trip = -1, boardPos = -1, boardStop = -1;
      for (let pos = startPos; pos < pat.stops.length; pos++) {
        const s = pat.stops[pos];
        if (trip >= 0) {
          const a = pat.trips[trip].arr[pos];
          if (a < best[s] && a < bestDest) {
            tau[k][s] = a; best[s] = a; byRide[k][s] = 1;
            prev[k][s] = { kind: 'ride', p: pi, trip, boardPos, alightPos: pos, boardStop };
            rideMarked.push(s); marked.add(s);
          }
        }
        const prevT = tau[k - 1][s];
        if (prevT < Infinity && pos < pat.stops.length - 1) {
          const ready = prevT + (byRide[k - 1][s] ? MIN_TRANSFER_SEC : 0);
          if (trip < 0 || ready <= pat.trips[trip].dep[pos]) {
            const e = earliestTrip(pat, pos, ready);
            if (e >= 0 && (trip < 0 || pat.trips[e].dep[pos] < pat.trips[trip].dep[pos])) { trip = e; boardPos = pos; boardStop = s; }
          }
        }
      }
    }

    for (const s of rideMarked) {
      if (prev[k][s]?.kind !== 'ride') continue;
      for (const [to, sec] of net.stops[s].transfers) {
        const t = tau[k][s] + sec;
        if (t < best[to] && t < bestDest) {
          tau[k][to] = t; best[to] = t; byRide[k][to] = 0;
          prev[k][to] = { kind: 'foot', from: s, sec };
          marked.add(to);
        }
      }
    }

    let roundBest = Infinity;
    let bestE: StopAccess | null = null;
    for (const e of egress) {
      const t = tau[k][e.stop] + e.sec;
      if (t < roundBest) { roundBest = t; bestE = e; }
    }
    if (bestE && roundBest < bestDest) {
      bestDest = roundBest;
      journeys.push(reconstruct(net, prev, k, bestE, roundBest));
    }
  }
  return journeys;
}

function reconstruct(net: Network, prev: (Prev | undefined)[][], k: number, egress: StopAccess, arrive: number): Journey {
  const steps: (RideStep | FootStep)[] = [];
  let stop = egress.stop;
  let round = k;
  let access: StopAccess | null = null;
  for (;;) {
    const pr = prev[round][stop]!;
    if (pr.kind === 'access') { access = pr.a; break; }
    if (pr.kind === 'foot') { steps.unshift({ kind: 'foot', from: pr.from, to: stop, sec: pr.sec }); stop = pr.from; continue; }
    steps.unshift({ kind: 'ride', p: pr.p, trip: pr.trip, boardPos: pr.boardPos, alightPos: pr.alightPos });
    stop = pr.boardStop;
    round--;
  }
  const first = steps.find((s): s is RideStep => s.kind === 'ride')!;
  return { rides: k, access, egress, steps, arrive, firstDepart: net.patterns[first.p].trips[first.trip].dep[first.boardPos] };
}
