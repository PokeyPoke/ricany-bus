import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { dict, lang, t } from '../src/lib/i18n';

describe('i18n', () => {
  it('cs and en have identical keys and no empty strings', () => {
    expect(Object.keys(dict.en).sort()).toEqual(Object.keys(dict.cs).sort());
    for (const l of ['cs', 'en'] as const) for (const v of Object.values(dict[l])) expect(v.length).toBeGreaterThan(0);
  });
  it('interpolates variables', () => {
    lang.set('cs');
    expect(get(t)('whereTo')).toBe('Kam jedete?');
    expect(get(t)('inMin', { n: 4 })).toBe('za 4 min');
    lang.set('en');
    expect(get(t)('whereTo')).toBe('Where to?');
    lang.set('cs');
  });
});

describe('first-visit language', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  const memStorage = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const fresh = async (languages: string[], stored: Record<string, string> = {}) => {
    vi.resetModules();
    vi.stubGlobal('localStorage', memStorage(stored));
    vi.stubGlobal('navigator', { languages, language: languages[0] });
    return get((await import('../src/lib/i18n')).lang);
  };
  it('follows the browser when it is Czech (or Slovak) or English, else Czech', async () => {
    expect(await fresh(['cs-CZ', 'en'])).toBe('cs');
    expect(await fresh(['sk'])).toBe('cs');
    expect(await fresh(['en-US', 'cs'])).toBe('en');
    expect(await fresh(['de-DE', 'en-GB'])).toBe('en');
    expect(await fresh(['de-DE', 'pl'])).toBe('cs');
    expect(await fresh([])).toBe('cs');
  });
  it('remembers a choice, not the default', async () => {
    vi.resetModules();
    const store = memStorage();
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('navigator', { languages: ['cs'], language: 'cs' });
    const { lang } = await import('../src/lib/i18n');
    expect(store.getItem('rb.langChoice')).toBeNull();
    lang.set('en'); lang.set('cs');
    expect(store.getItem('rb.langChoice')).toBe(JSON.stringify('cs'));
  });
  it('keeps a saved choice', async () => {
    expect(await fresh(['en-US'], { 'rb.langChoice': JSON.stringify('cs') })).toBe('cs');
  });
});
