import { LINE_STYLE, type FreeRouteId } from '@rb/shared';

function ctx2d(px: number): CanvasRenderingContext2D {
  const c: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
  return c.getContext('2d') as CanvasRenderingContext2D;
}

/** Browser only: rounded square in the line colour with the number centred and a white border. Drawn at 2x (72 px); register with pixelRatio 2. */
export function drawBusIcon(routeId: FreeRouteId, px = 72): ImageData {
  const s = LINE_STYLE[routeId];
  const ctx = ctx2d(px);
  const k = px / 36; // design units are 36x36
  ctx.scale(k, k);
  const r = 8, b = 2, u = 36;
  ctx.beginPath();
  ctx.roundRect(b / 2, b / 2, u - b, u - b, r);
  ctx.fillStyle = s.color; ctx.fill();
  ctx.lineWidth = b; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ctx.fillStyle = s.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${s.number.length > 1 ? 16 : 20}px sans-serif`;
  ctx.fillText(s.number, u / 2, u / 2 + 1);
  return ctx.getImageData(0, 0, px, px);
}

/** Browser only: small white-bordered triangle pointing up (rotated by icon-rotate). Drawn at 2x (48 px); register with pixelRatio 2. */
export function drawArrow(px = 48): ImageData {
  const ctx = ctx2d(px);
  const k = px / 24; // design units are 24x24
  ctx.scale(k, k);
  const u = 24;
  ctx.beginPath();
  ctx.moveTo(u / 2, 3); ctx.lineTo(u - 4, u - 4); ctx.lineTo(u / 2, u - 9); ctx.lineTo(4, u - 4); ctx.closePath();
  ctx.fillStyle = '#1d2a3a'; ctx.fill();
  ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  return ctx.getImageData(0, 0, px, px);
}
