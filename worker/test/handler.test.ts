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
});
