const NEEDLE = new TextEncoder().encode('L173');

function contains(buf: Uint8Array, start: number, end: number, needle: Uint8Array): boolean {
  const n0 = needle[0], last = end - needle.length;
  outer: for (let i = start; i <= last; i++) {
    if (buf[i] !== n0) continue;
    for (let k = 1; k < needle.length; k++) if (buf[i + k] !== needle[k]) continue outer;
    return true;
  }
  return false;
}

/** Copies the FeedHeader and only those top-level FeedEntity fields whose bytes contain `needle`. */
export function prefilter(buf: Uint8Array, needle: Uint8Array = NEEDLE): Uint8Array {
  const keep: [number, number][] = [];
  let pos = 0, total = 0;
  const varint = () => {
    let r = 0, s = 0, b: number;
    do {
      if (pos >= buf.length) throw new Error('truncated varint');
      b = buf[pos++]; r += (b & 0x7f) * 2 ** s; s += 7;
    } while (b & 0x80);
    return r;
  };
  while (pos < buf.length) {
    const start = pos;
    const key = varint();
    if ((key & 7) !== 2) throw new Error('unexpected wire type at top level');
    const len = varint();
    const end = pos + len;
    if (end > buf.length) throw new Error('truncated field');
    const field = Math.floor(key / 8);
    if (field === 1 || (field === 2 && contains(buf, pos, end, needle))) { keep.push([start, end]); total += end - start; }
    pos = end;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const [s, e] of keep) { out.set(buf.subarray(s, e), o); o += e - s; }
  return out;
}
