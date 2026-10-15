// Usage: node worker/scripts/make-fixture.mjs in.pb out.pb
// Keeps the FeedHeader, every free-line entity (raw bytes contain "L173x") and the first 40 others.
import { readFileSync, writeFileSync } from 'node:fs';
const [, , input, output] = process.argv;
const buf = readFileSync(input);
let pos = 0;
const varint = () => { let r = 0, s = 0, b; do { b = buf[pos++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
const parts = [];
let others = 0, free = 0;
while (pos < buf.length) {
  const start = pos;
  const field = Math.floor(varint() / 8);
  const len = varint();
  const end = pos + len;
  if (field === 1) parts.push(buf.subarray(start, end));
  else if (field === 2) {
    const isFree = /L173[1-7]/.test(buf.subarray(pos, end).toString('latin1'));
    if (isFree) free++;
    if (isFree || others++ < 40) parts.push(buf.subarray(start, end));
  }
  pos = end;
}
writeFileSync(output, Buffer.concat(parts));
console.log(`kept ${free} free + ${Math.min(others, 40)} other entities`);
