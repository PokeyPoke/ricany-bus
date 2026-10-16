import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHandler } from '../src/index';

const pb = readFileSync(new URL('./fixture/trip_updates.pb', import.meta.url));
const ok = () => Promise.resolve(new Response(pb, { status: 200 }));
const req = (path: string, method = 'GET') => new Request('https://w.example' + path, { method });

describe('handler', () => {
  it('serves /delays with CORS and cache headers', async () => {
    const h = createHandler({ fetchUpstream: ok, now: () => 0 });
    const res = await h(req('/delays'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('public, max-age=15');
    const body = await res.json();
    expect(Object.keys(body.trips).length).toBeGreaterThan(0);
  });
  it('memoizes upstream for 15 s', async () => {
    let t = 0;
    const fetchUpstream = vi.fn(ok);
    const h = createHandler({ fetchUpstream, now: () => t });
    await h(req('/delays'));
    t = 10_000; await h(req('/delays'));
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
    t = 16_000; await h(req('/delays'));
    expect(fetchUpstream).toHaveBeenCalledTimes(2);
  });
  it('returns 503 when upstream fails', async () => {
    const h = createHandler({ fetchUpstream: () => Promise.resolve(new Response('x', { status: 500 })), now: () => 0 });
    const res = await h(req('/delays'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/upstream 500/);
  });
  it('404s other paths and answers OPTIONS', async () => {
    const h = createHandler({ fetchUpstream: ok, now: () => 0 });
    expect((await h(req('/nope'))).status).toBe(404);
    expect((await h(req('/delays', 'OPTIONS'))).status).toBe(204);
  });
  it('serves /positions', async () => {
    const vpBuf = readFileSync(new URL('./fixture/vehicle_positions.pb', import.meta.url));
    const h = createHandler({ fetchUpstream: async (url) => new Response(url.includes('vehicle_positions') ? vpBuf : pb), now: () => 0 });
    const res = await h(req('/positions'));
    expect(res.status).toBe(200);
    expect((await res.json()).vehicles.length).toBeGreaterThan(0);
  });
  it('serves stale data with X-Stale for up to 120 s when upstream fails', async () => {
    let t = 0; let fail = false;
    const h = createHandler({ fetchUpstream: async () => (fail ? new Response('x', { status: 502 }) : new Response(pb)), now: () => t });
    await h(req('/delays'));
    fail = true; t = 60_000;
    const stale = await h(req('/delays'));
    expect(stale.status).toBe(200);
    expect(stale.headers.get('x-stale')).toBe('1');
    t = 130_000;
    expect((await h(req('/delays'))).status).toBe(503);
  });
  it('garbage body is treated as upstream failure', async () => {
    const h = createHandler({ fetchUpstream: async () => new Response(new Uint8Array([0x12, 0xff, 0xff, 0x03, 0x01])), now: () => 0 });
    expect((await h(req('/delays'))).status).toBe(503);
  });
  it('times out a hung upstream', async () => {
    const h = createHandler({ fetchUpstream: (_u, signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))), now: () => 0, timeoutMs: 20 });
    expect((await h(req('/delays'))).status).toBe(503);
  });
});
