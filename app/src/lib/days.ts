/** "pondělí 19. 10." / "Monday 19/10" for a YYYYMMDD service date. */
export function dayName(date: string, lang: 'cs' | 'en'): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)));
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(d);
}
