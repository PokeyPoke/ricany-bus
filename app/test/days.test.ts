import { describe, expect, it } from 'vitest';
import { dayName } from '../src/lib/days';

describe('dayName', () => {
  it('names the weekday and date', () => {
    expect(dayName('20261019', 'cs')).toMatch(/pondělí 19\. ?10\./);
    expect(dayName('20261019', 'en')).toMatch(/Monday/);
  });
});
