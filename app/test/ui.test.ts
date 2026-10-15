import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { now } from '../src/lib/ui';

afterEach(() => vi.useRealTimers());

describe('now store', () => {
  it('is fresh again after unsubscribe / resubscribe', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T08:00:00+02:00'));
    const un = now.subscribe(() => {});
    const first = get(now);
    un();
    vi.setSystemTime(new Date('2026-10-19T11:00:00+02:00'));
    const again = get(now);
    expect(first.sec).toBe(8 * 3600);
    expect(again.sec).toBe(11 * 3600);
  });
});
