import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const p = (f: string) => fileURLToPath(new URL(`../${f}`, import.meta.url));
const html = readFileSync(p('index.html'), 'utf8');

describe('index.html meta', () => {
  const tags: [string, string, string][] = [
    ['property', 'og:type', 'website'],
    ['property', 'og:title', 'Říčany zdarma'],
    ['property', 'og:url', 'https://pokeypoke.github.io/ricany-bus/'],
    ['property', 'og:image', 'https://pokeypoke.github.io/ricany-bus/og.png'],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:locale', 'cs_CZ'],
    ['name', 'twitter:card', 'summary_large_image']
  ];
  for (const [attr, key, val] of tags) {
    it(`${key}`, () => expect(html).toContain(`<meta ${attr}="${key}" content="${val}"`));
  }
  it('og:description present', () => expect(html).toMatch(/<meta property="og:description" content="[^"]+"/));
  it('og.png is 1200x630 PNG', () => {
    const b = readFileSync(p('public/og.png'));
    expect(b.subarray(1, 4).toString()).toBe('PNG');
    expect(b.readUInt32BE(16)).toBe(1200);
    expect(b.readUInt32BE(20)).toBe(630);
  });
});
