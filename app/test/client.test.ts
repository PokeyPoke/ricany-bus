import { describe, it, expect, vi, afterEach } from 'vitest';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  posted: unknown[] = [];
  constructor() { FakeWorker.instances.push(this); }
  postMessage(m: unknown) { this.posted.push(m); }
}

const data = { stops: [], timetable: { patterns: [], servicesByDate: {} } };
const req = { from: { lat: 1, lon: 2, name: 'a' }, to: { lat: 3, lon: 4, name: 'b' }, mode: 'dep' as const, date: '20261019', sec: 100 };

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); FakeWorker.instances = []; });

describe('planInWorker', () => {
  it('rejects pending plans when the worker errors and retries with a fresh worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { planInWorker } = await import('../src/router/client');
    const p1 = planInWorker(req, null, data);
    const p2 = planInWorker(req, null, data);
    expect(FakeWorker.instances.length).toBe(1);
    FakeWorker.instances[0].onerror!({ message: 'boom' });
    await expect(p1).rejects.toThrow();
    await expect(p2).rejects.toThrow();
    const p3 = planInWorker(req, null, data);
    expect(FakeWorker.instances.length).toBe(2);
    FakeWorker.instances[1].onmessage!({ data: { id: 3, result: 'ok' } });
    await expect(p3).resolves.toBe('ok');
  });

  it('sends the page data to the worker once (init), then only plan messages; re-sends for a new data object or a fresh worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { planInWorker } = await import('../src/router/client');
    void planInWorker(req, null, data).catch(() => {});
    void planInWorker(req, null, data).catch(() => {});
    const w = FakeWorker.instances[0];
    const kinds = (x: FakeWorker) => x.posted.map((m) => ('init' in (m as object) ? 'init' : 'plan'));
    expect(kinds(w)).toEqual(['init', 'plan', 'plan']);
    expect((w.posted[0] as { init: unknown }).init).toEqual({ stops: data.stops, tt: data.timetable });
    const data2 = { ...data };
    void planInWorker(req, null, data2).catch(() => {});
    expect(kinds(w)).toEqual(['init', 'plan', 'plan', 'init', 'plan']);
    w.onerror!({ message: 'boom' });
    void planInWorker(req, null, data2).catch(() => {});
    expect(kinds(FakeWorker.instances[1])).toEqual(['init', 'plan']);
  });
});
