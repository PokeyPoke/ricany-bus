import { describe, it, expect } from 'vitest';
import { shareLink } from '../src/lib/share';

const abort = () => Object.assign(new Error('x'), { name: 'AbortError' });

describe('shareLink', () => {
  it('uses navigator.share when available', async () => {
    let got: unknown;
    const nav = { share: async (d: unknown) => { got = d; } } as unknown as Navigator;
    expect(await shareLink('https://x/#/a', 'T', nav)).toBe('shared');
    expect(got).toEqual({ url: 'https://x/#/a', title: 'T' });
  });
  it('treats a cancelled share as a no-op', async () => {
    const nav = { share: async () => { throw abort(); } } as unknown as Navigator;
    expect(await shareLink('u', 'T', nav)).toBe('shared');
  });
  it('falls back to the clipboard when share is missing or fails', async () => {
    const written: string[] = [];
    const clipboard = { writeText: async (s: string) => { written.push(s); } };
    expect(await shareLink('u1', 'T', { clipboard } as unknown as Navigator)).toBe('copied');
    const nav = { share: async () => { throw new Error('nope'); }, clipboard } as unknown as Navigator;
    expect(await shareLink('u2', 'T', nav)).toBe('copied');
    expect(written).toEqual(['u1', 'u2']);
  });
  it('returns manual when nothing works', async () => {
    expect(await shareLink('u', 'T', {} as Navigator)).toBe('manual');
    const nav = { clipboard: { writeText: async () => { throw new Error('denied'); } } } as unknown as Navigator;
    expect(await shareLink('u', 'T', nav)).toBe('manual');
  });
});
