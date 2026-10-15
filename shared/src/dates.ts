const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
const fromUtc = (ms: number) => {
  const x = new Date(ms);
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
};
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86400000);
/** 0 = Monday … 6 = Sunday */
export const weekday = (d: string) => (new Date(toUtc(d)).getUTCDay() + 6) % 7;
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
