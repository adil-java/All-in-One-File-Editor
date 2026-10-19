import type { Point } from './types';

/** SVG path data for a freehand stroke, smoothed with quadratic curves through midpoints. */
export function inkPath(points: Point[]) {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += ` Q ${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** The two outer points of an arrowhead at `to`, pointing away from `from`. */
export function arrowHead(from: Point, to: Point, strokeWidth: number): [Point, Point] {
  const size = Math.max(8, strokeWidth * 4);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  return [
    { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) },
    { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) },
  ];
}

/** Maps a normalized (0..1) point into a box. */
export function denormalize(p: Point, box: { x: number; y: number; w: number; h: number }) {
  return { x: box.x + p.x * box.w, y: box.y + p.y * box.h };
}
