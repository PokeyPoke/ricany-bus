import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { dict, lang, t } from '../src/lib/i18n';

describe('i18n', () => {
  it('cs and en have identical keys and no empty strings', () => {
    expect(Object.keys(dict.en).sort()).toEqual(Object.keys(dict.cs).sort());
    for (const l of ['cs', 'en'] as const) for (const v of Object.values(dict[l])) expect(v.length).toBeGreaterThan(0);
  });
  it('defaults to Czech and interpolates variables', () => {
    expect(get(lang)).toBe('cs');
    expect(get(t)('whereTo')).toBe('Kam jedete?');
    expect(get(t)('inMin', { n: 4 })).toBe('za 4 min');
    lang.set('en');
    expect(get(t)('whereTo')).toBe('Where to?');
    lang.set('cs');
  });
});
