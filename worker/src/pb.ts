// Minimal protobuf reader for the GTFS-RT TripUpdate subset we need.
// Field numbers from gtfs-realtime.proto: FeedMessage{header=1, entity=2}, FeedHeader{timestamp=3},
// FeedEntity{trip_update=3}, TripUpdate{trip=1, stop_time_update=2, delay=5},
// TripDescriptor{trip_id=1, start_date=3, route_id=5}, StopTimeUpdate{stop_sequence=1, arrival=2, departure=3, stop_id=4},
// StopTimeEvent{delay=1}.
const DEC = new TextDecoder();
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
  float32(): number { const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true); this.pos += 4; return v; }
  private span(): [number, number] {
    const n = this.uint(); const s = this.pos; this.pos += n;
    if (this.pos > this.end) throw new Error('truncated');
    return [s, this.pos];
  }
  string(): string { const [s, e] = this.span(); return DEC.decode(this.buf.subarray(s, e)); }
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

export interface RawVehicle {
  trip: { tripId: string | null; routeId: string | null; startDate: string | null } | null;
  lat: number | null; lon: number | null; bearing: number | null; speed: number | null;
  stopSeq: number | null; ts: number | null; id: string | null; label: string | null;
}
function readPosition(r: Reader, v: RawVehicle) {
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 5) v.lat = r.float32();
    else if (f === 2 && wt === 5) v.lon = r.float32();
    else if (f === 3 && wt === 5) v.bearing = r.float32();
    else if (f === 5 && wt === 5) v.speed = r.float32();
    else r.skip(wt);
  }
}
function readVehicleDescriptor(r: Reader, v: RawVehicle) {
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) v.id = r.string();
    else if (f === 2 && wt === 2) v.label = r.string();
    else r.skip(wt);
  }
}
function readVehicle(r: Reader): RawVehicle {
  const v: RawVehicle = { trip: null, lat: null, lon: null, bearing: null, speed: null, stopSeq: null, ts: null, id: null, label: null };
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) v.trip = readTrip(r.sub());
    else if (f === 2 && wt === 2) readPosition(r.sub(), v);
    else if (f === 3 && wt === 0) v.stopSeq = r.uint();
    else if (f === 5 && wt === 0) v.ts = r.uint();
    else if (f === 8 && wt === 2) readVehicleDescriptor(r.sub(), v);
    else r.skip(wt);
  }
  return v;
}
export function decodeVehiclePositions(buf: Uint8Array): { timestamp: number; vehicles: RawVehicle[] } {
  const r = new Reader(buf);
  let timestamp = 0;
  const vehicles: RawVehicle[] = [];
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) { const h = r.sub(); for (const [hf, hwt] of h.fields()) { if (hf === 3 && hwt === 0) timestamp = h.uint(); else h.skip(hwt); } }
    else if (f === 2 && wt === 2) { const e = r.sub(); for (const [ef, ewt] of e.fields()) { if (ef === 4 && ewt === 2) vehicles.push(readVehicle(e.sub())); else e.skip(ewt); } }
    else r.skip(wt);
  }
  return { timestamp, vehicles };
}

// Alerts: FeedEntity{id=1, alert=5}, Alert{active_period=1, informed_entity=5, url=8, header_text=10, description_text=11},
// TimeRange{start=1, end=2}, EntitySelector{route_id=2}, TranslatedString{translation=1}, Translation{text=1, language=2}.
export interface RawAlert {
  id: string; routeIds: string[]; periods: { start: number | null; end: number | null }[];
  header: Record<string, string>; description: Record<string, string>; url: Record<string, string>;
}
function readTranslated(r: Reader): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [f, wt] of r.fields()) {
    if (f !== 1 || wt !== 2) { r.skip(wt); continue; }
    const t = r.sub();
    let text = '', lang = '';
    for (const [tf, twt] of t.fields()) { if (tf === 1 && twt === 2) text = t.string(); else if (tf === 2 && twt === 2) lang = t.string(); else t.skip(twt); }
    out[lang] = text;
  }
  return out;
}
function readAlert(r: Reader, a: RawAlert) {
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) {
      const p = r.sub(); const period = { start: null as number | null, end: null as number | null };
      for (const [pf, pwt] of p.fields()) { if (pf === 1 && pwt === 0) period.start = p.uint(); else if (pf === 2 && pwt === 0) period.end = p.uint(); else p.skip(pwt); }
      a.periods.push(period);
    } else if (f === 5 && wt === 2) {
      const e = r.sub();
      for (const [ef, ewt] of e.fields()) { if (ef === 2 && ewt === 2) a.routeIds.push(e.string()); else e.skip(ewt); }
    } else if (f === 8 && wt === 2) a.url = readTranslated(r.sub());
    else if (f === 10 && wt === 2) a.header = readTranslated(r.sub());
    else if (f === 11 && wt === 2) a.description = readTranslated(r.sub());
    else r.skip(wt);
  }
}

export function decodeAlerts(buf: Uint8Array): { timestamp: number; alerts: RawAlert[] } {
  const r = new Reader(buf);
  let timestamp = 0;
  const alerts: RawAlert[] = [];
  for (const [f, wt] of r.fields()) {
    if (f === 1 && wt === 2) {
      const h = r.sub();
      for (const [hf, hwt] of h.fields()) { if (hf === 3 && hwt === 0) timestamp = h.uint(); else h.skip(hwt); }
    } else if (f === 2 && wt === 2) {
      const e = r.sub();
      let id = '';
      for (const [ef, ewt] of e.fields()) {
        if (ef === 1 && ewt === 2) id = e.string();
        else if (ef === 5 && ewt === 2) { const a: RawAlert = { id, routeIds: [], periods: [], header: {}, description: {}, url: {} }; readAlert(e.sub(), a); alerts.push(a); }
        else e.skip(ewt);
      }
    } else r.skip(wt);
  }
  return { timestamp, alerts };
}
