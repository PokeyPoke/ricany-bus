import { LINE_STYLE, type FreeRouteId } from '@rb/shared';
import { darken, signFontPx } from './busStyle';

function ctx2d(w: number, h: number): CanvasRenderingContext2D {
  const c: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return c.getContext('2d') as CanvasRenderingContext2D;
}

/** Logical size of the bus icon (design units == CSS px). */
export const BUS_W = 48, BUS_H = 54;

type RR = (x: number, y: number, w: number, h: number, r: number) => void;

/** Draws the cute front-view bus into ctx (design units, 48x54). Exposed for scratch previews. */
export function paintBus(ctx: CanvasRenderingContext2D, routeId: FreeRouteId): void {
  const s = LINE_STYLE[routeId];
  const edge = darken(s.color, 0.28);
  const rr: RR = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const bx = 7, by = 3, bw = 34, bh = 42;

  // white halo around the whole silhouette (body, wheels, ears)
  ctx.save();
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
  for (const [x, y, w, h, r] of [[bx, by, bw, bh, 11], [bx + 3, by + bh - 4, 9, 9, 4], [bx + bw - 12, by + bh - 4, 9, 9, 4], [bx - 4, 26, 7, 8, 3.5], [bx + bw - 3, 26, 7, 8, 3.5]] as number[][]) {
    rr(x, y, w, h, r); ctx.stroke(); ctx.fill();
  }
  ctx.restore();

  // wheels peeking under the body
  ctx.fillStyle = '#2a3036';
  rr(bx + 3, by + bh - 4, 9, 9, 4); ctx.fill();
  rr(bx + bw - 12, by + bh - 4, 9, 9, 4); ctx.fill();
  ctx.fillStyle = '#8b96a1';
  for (const cx of [bx + 7.5, bx + bw - 7.5]) { ctx.beginPath(); ctx.arc(cx, by + bh + 0.5, 1.5, 0, 7); ctx.fill(); }

  // side mirrors ("ears")
  ctx.fillStyle = edge;
  rr(bx - 4, 26, 7, 8, 3.5); ctx.fill();
  rr(bx + bw - 3, 26, 7, 8, 3.5); ctx.fill();

  // body
  rr(bx, by, bw, bh, 11);
  ctx.fillStyle = s.color; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = edge; ctx.stroke();
  // soft top highlight
  ctx.save(); rr(bx, by, bw, bh, 11); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(bx, by, bw, 5);
  ctx.restore();

  // destination sign with the line number (always dark text on white)
  rr(bx + 4, by + 3.5, bw - 8, 16, 5);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = edge; ctx.stroke();
  ctx.fillStyle = '#16202b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${signFontPx(s.number) + 1}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(s.number, bx + bw / 2, by + 12);

  // windscreen
  rr(bx + 4, by + 22, bw - 8, 12, 5);
  const g = ctx.createLinearGradient(0, by + 22, 0, by + 34);
  g.addColorStop(0, '#d9f1ff'); g.addColorStop(1, '#9fd3f2');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = edge; ctx.stroke();
  // glass glint
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx + 9, by + 26); ctx.lineTo(bx + 13, by + 26); ctx.stroke();

  // headlights
  for (const cx of [bx + 8, bx + bw - 8]) {
    ctx.beginPath(); ctx.arc(cx, by + 38, 3.2, 0, 7);
    ctx.fillStyle = '#fff3b0'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = edge; ctx.stroke();
  }
  // bumper smile
  ctx.strokeStyle = edge; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(bx + bw / 2, by + 34.5, 6, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
}

/** Browser only. Drawn at 2x (96x108); register with pixelRatio 2. */
export function drawBusIcon(routeId: FreeRouteId): ImageData {
  const k = 2;
  const ctx = ctx2d(BUS_W * k, BUS_H * k);
  ctx.scale(k, k);
  paintBus(ctx, routeId);
  return ctx.getImageData(0, 0, BUS_W * k, BUS_H * k);
}

/** Browser only: small triangle in the given colour with a white stroke, pointing up (rotated by icon-rotate). 2x (40 px). */
export function drawArrow(color = '#1d2a3a', px = 40): ImageData {
  const ctx = ctx2d(px, px);
  const k = px / 20; // design units are 20x20
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(10, 2); ctx.lineTo(17, 17); ctx.lineTo(10, 13); ctx.lineTo(3, 17); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ctx.fillStyle = color; ctx.fill();
  return ctx.getImageData(0, 0, px, px);
}
