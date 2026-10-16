import { LINE_STYLE, type FreeRouteId } from '@rb/shared';

export const ringKey = (lines: FreeRouteId[]) => 'ring-' + lines.join('-');

const GAP = 0.08;
const GREY = '#8a96a3';

/** Equal arcs starting at 12 o'clock, one per line, in the given order. */
export function ringSegments(lines: FreeRouteId[]): { color: string; start: number; end: number }[] {
  const n = lines.length;
  if (!n) return [];
  if (n === 1) return [{ color: LINE_STYLE[lines[0]].color, start: -Math.PI / 2, end: (3 * Math.PI) / 2 }];
  const arc = (2 * Math.PI) / n;
  return lines.map((l, i) => ({ color: LINE_STYLE[l].color, start: -Math.PI / 2 + i * arc + GAP / 2, end: -Math.PI / 2 + (i + 1) * arc - GAP / 2 }));
}

/** Browser only: white disc with a coloured ring segment per line. */
export function drawRing(lines: FreeRouteId[], px = 48): ImageData {
  const c: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const mid = px / 2, w = px * 0.16, r = mid - w / 2 - 1;
  ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, 2 * Math.PI); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = w; ctx.lineCap = 'butt';
  const segs = ringSegments(lines);
  if (!segs.length) segs.push({ color: GREY, start: 0, end: 2 * Math.PI });
  for (const s of segs) { ctx.beginPath(); ctx.arc(mid, mid, r, s.start, s.end); ctx.strokeStyle = s.color; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(mid, mid, mid - 0.5, 0, 2 * Math.PI); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
  return ctx.getImageData(0, 0, px, px);
}
