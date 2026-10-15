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
