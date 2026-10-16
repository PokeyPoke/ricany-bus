export interface ScreenPt { id: string; x: number; y: number }

/**
 * Pixel offsets so markers closer than minPx are fanned out around their cluster centroid on a circle
 * (radius >= max(minRadius, minPx / (2 sin(pi/n))), members ordered by id starting at 12 o'clock; isolated markers get [0,0].
 */
export function spreadOffsets(pts: ScreenPt[], minPx = 34, minRadius = 0): Record<string, [number, number]> {
  const sorted = [...pts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: Record<string, [number, number]> = {};
  const seen = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (seen.has(i)) continue;
    seen.add(i);
    const cluster = [i];
    for (let q = 0; q < cluster.length; q++) {
      const a = sorted[cluster[q]];
      for (let j = 0; j < sorted.length; j++) {
        if (seen.has(j)) continue;
        if (Math.hypot(a.x - sorted[j].x, a.y - sorted[j].y) < minPx) { seen.add(j); cluster.push(j); }
      }
    }
    const members = cluster.map((k) => sorted[k]).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const n = members.length;
    if (n < 2) { out[members[0].id] = [0, 0]; continue; }
    const cx = members.reduce((s, m) => s + m.x, 0) / n, cy = members.reduce((s, m) => s + m.y, 0) / n;
    const r = Math.max(minRadius, minPx / (2 * Math.sin(Math.PI / n)));
    members.forEach((m, k) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * k) / n;
      out[m.id] = [cx + r * Math.cos(ang) - m.x, cy + r * Math.sin(ang) - m.y];
    });
  }
  return out;
}
