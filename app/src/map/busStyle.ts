/** Pure helpers for the bus icon drawing (no canvas, unit-testable). */
export function darken(hex: string, f: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - f)).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
/** Font px (design units) for the destination sign number. */
export const signFontPx = (num: string): number => (num.length > 1 ? 12 : 14);
