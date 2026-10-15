// Minimal protobuf reader for the GTFS-RT TripUpdate subset we need.
// Field numbers from gtfs-realtime.proto: FeedMessage{header=1, entity=2}, FeedHeader{timestamp=3},
// FeedEntity{trip_update=3}, TripUpdate{trip=1, stop_time_update=2, delay=5},
// TripDescriptor{trip_id=1, start_date=3, route_id=5}, StopTimeUpdate{stop_sequence=1, arrival=2, departure=3, stop_id=4},
// StopTimeEvent{delay=1}.
class Reader {
  constructor(private buf: Uint8Array, public pos = 0, private end = buf.length) {}
  private varint(): { lo: number; hi: number } {
    let lo = 0, hi = 0, shift = 0, b: number;
    do {
      b = this.buf[this.pos++];
      if (shift < 28) lo |= (b & 0x7f) << shift;
      else if (shift === 28) { lo |= (b & 0x0f) << 28; hi |= (b & 0x7f) >> 4; }
      else hi |= (b & 0x7f) << (shift - 32);
      shift += 7;
    } while (b & 0x80);
    return { lo: lo >>> 0, hi: hi >>> 0 };
  }
  uint(): number { const { lo, hi } = this.varint(); return hi * 4294967296 + lo; }
  int32(): number { return this.varint().lo | 0; }
  private span(): [number, number] { const n = this.uint(); const s = this.pos; this.pos += n; return [s, this.pos]; }
  string(): string { const [s, e] = this.span(); return new TextDecoder().decode(this.buf.subarray(s, e)); }
  sub(): Reader { const [s, e] = this.span(); return new Reader(this.buf, s, e); }
  skip(wt: number): void {
    if (wt === 0) this.varint();
    else if (wt === 1) this.pos += 8;
    else if (wt === 2) this.span();
    else if (wt === 5) this.pos += 4;
    else throw new Error('unsupported wire type ' + wt);
  }
  *fields(): Generator<[number, number]> {
    while (this.pos < this.end) { const k = this.uint(); yield [Math.floor(k / 8), k & 7]; }
  }
}

export interface StopTimeUpdate { stopSequence: number | null; stopId: string | null; arrivalDelay: number | null; departureDelay: number | null }
export interface TripUpdate {
  trip: { tripId: string | null; routeId: string | null; startDate: string | null } | null;
  delay: number | null;
  stopTimeUpdates: StopTimeUpdate[];
}

function readEvent(r: Reader): number | null {
  let delay: number | null = null;
  for (const [f, wt] of r.fields()) { if (f === 1 && wt === 0) delay = r.int32(); else r.skip(wt); }
  return delay;
}
function readStu(r: Reader): StopTimeUpdate {
  const s: StopTimeUpdate = { stopSequence: null, stopId: null, arrivalDelay: null, departureDelay: null };
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 0) s.stopSequence = r.uint();
    else if (f === 2 && wt === 2) s.arrivalDelay = readEvent(r.sub());
    else if (f === 3 && wt === 2) s.departureDelay = readEvent(r.sub());
    else if (f === 4 && wt === 2) s.stopId = r.string();
    else r.skip(wt);
  }
  return s;
}
function readTrip(r: Reader): NonNullable<TripUpdate['trip']> {
  const t = { tripId: null as string | null, routeId: null as string | null, startDate: null as string | null };
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) t.tripId = r.string();
    else if (f === 3 && wt === 2) t.startDate = r.string();
    else if (f === 5 && wt === 2) t.routeId = r.string();
    else r.skip(wt);
  }
  return t;
}
function readTripUpdate(r: Reader): TripUpdate {
  const u: TripUpdate = { trip: null, delay: null, stopTimeUpdates: [] };
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) u.trip = readTrip(r.sub());
    else if (f === 2 && wt === 2) u.stopTimeUpdates.push(readStu(r.sub()));
    else if (f === 5 && wt === 0) u.delay = r.int32();
    else r.skip(wt);
  }
  return u;
}

export function decodeTripUpdates(buf: Uint8Array): { timestamp: number; updates: TripUpdate[] } {
  const r = new Reader(buf);
  let timestamp = 0;
  const updates: TripUpdate[] = [];
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) {
      const h = r.sub();
      for (const [hf, hwt] of h.fields()) { if (hf === 3 && hwt === 0) timestamp = h.uint(); else h.skip(hwt); }
    } else if (f === 2 && wt === 2) {
      const e = r.sub();
      for (const [ef, ewt] of e.fields()) { if (ef === 3 && ewt === 2) updates.push(readTripUpdate(e.sub())); else e.skip(ewt); }
    } else r.skip(wt);
  }
  return { timestamp, updates };
}
