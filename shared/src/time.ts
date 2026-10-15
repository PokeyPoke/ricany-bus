const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function pragueNow(at: Date = new Date()): { date: string; sec: number } {
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}${p.month}${p.day}`, sec: +p.hour * 3600 + +p.minute * 60 + +p.second };
}

/** Wall-clock (date, seconds) in Prague → UTC instant. */
export function pragueToUtc(date: string, sec: number): Date {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)) + sec * 1000;
  let t = guess - 3600 * 1000; // Prague is UTC+1 or UTC+2
  for (let i = 0; i < 3; i++) {
    const n = pragueNow(new Date(t));
    const shownMs = Date.UTC(+n.date.slice(0, 4), +n.date.slice(4, 6) - 1, +n.date.slice(6, 8)) + n.sec * 1000;
    t += guess - shownMs;
  }
  return new Date(t);
}

export function formatHM(sec: number): string {
  const s = ((Math.floor(sec / 60) * 60) % 86400 + 86400) % 86400;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}
export const hmToSec = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 3600 + m * 60;
};
export const secToHM = (sec: number) => {
  const s = ((sec % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
};
