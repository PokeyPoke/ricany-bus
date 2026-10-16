import { describe, it, expect, afterEach } from 'vitest';
import { load, save } from '../src/lib/storage';

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('storage', () => {
  it('round-trips JSON through localStorage', () => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    save('k', { a: 1 });
    expect(load('k', null)).toEqual({ a: 1 });
    expect(load('missing', 7)).toBe(7);
  });
  it('falls back when storage is unavailable or throws', () => {
    expect(load('k', 'fb')).toBe('fb');
    expect(() => save('k', 1)).not.toThrow();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(load('k', 'fb')).toBe('fb');
    expect(() => save('k', 1)).not.toThrow();
  });
  it('falls back on corrupt JSON', () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => '{not json', setItem: () => {} };
    expect(load('k', [])).toEqual([]);
  });
});

describe('persisted layer toggles', () => {
  it('coerces stored values and writes nothing until toggled', async () => {
    const mem: Record<string, string> = { 'rb.t.a': '"false"', 'rb.t.b': '1' };
    const ls = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    (globalThis as unknown as { localStorage: unknown }).localStorage = ls;
    const { persisted } = await import('../src/lib/ui');
    const { get } = await import('svelte/store');
    const a = persisted('rb.t.a', true), b = persisted('rb.t.b', true), c = persisted('rb.t.c', false);
    expect([get(a), get(b), get(c)]).toEqual([false, true, false]);
    expect(mem['rb.t.c']).toBeUndefined();
    c.set(true);
    expect(mem['rb.t.c']).toBe('true');
  });
});
