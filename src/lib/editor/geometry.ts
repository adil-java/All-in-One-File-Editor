import type { Annotation, Point, Rect, Rotation } from './types';

export const LINE_HEIGHT = 1.2;
/** Distance from the top of a text line to its baseline, as a fraction of font size. */
export const BASELINE = 0.8;
/** Rough average glyph width of Helvetica, used to size text selection boxes. */
const CHAR_WIDTH = 0.55;

/** Size of a page once an extra rotation is applied. */
export function rotatedSize(width: number, height: number, rotation: Rotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Converts a point on the displayed (rotated) page to base page coordinates. */
export function displayToBase(p: Point, base: { width: number; height: number }, r: Rotation) {
  switch (r) {
    case 90:
      return { x: p.y, y: base.height - p.x };
    case 180:
      return { x: base.width - p.x, y: base.height - p.y };
    case 270:
      return { x: base.width - p.y, y: p.x };
    default:
      return p;
  }
}

/** SVG transform that draws base page coordinates onto the displayed (rotated) page. */
export function baseToDisplayTransform(base: { width: number; height: number }, r: Rotation) {
  switch (r) {
    case 90:
      return `translate(${base.height} 0) rotate(90)`;
    case 180:
      return `translate(${base.width} ${base.height}) rotate(180)`;
    case 270:
      return `translate(0 ${base.width}) rotate(270)`;
    default:
      return undefined;
  }
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

export function textLines(text: string) {
  return text.split('\n');
}

export function bounds(a: Annotation): Rect {
  switch (a.type) {
    case 'ink': {
      const xs = a.points.map((p) => p.x);
      const ys = a.points.map((p) => p.y);
      const pad = a.width / 2;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
    }
    case 'line': {
      const pad = a.strokeWidth * (a.arrow ? 3 : 1);
      const r = normalizeRect(a.from, a.to);
      return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
    }
    case 'text': {
      const lines = textLines(a.text);
      const longest = Math.max(...lines.map((l) => l.length), 1);
      return {
        x: a.x,
        y: a.y,
        w: longest * a.fontSize * CHAR_WIDTH,
        h: lines.length * a.fontSize * LINE_HEIGHT,
      };
    }
    default:
      return { x: a.x, y: a.y, w: a.w, h: a.h };
  }
}

export function containsPoint(r: Rect, p: Point, slop = 0) {
  return (
    p.x >= r.x - slop && p.x <= r.x + r.w + slop && p.y >= r.y - slop && p.y <= r.y + r.h + slop
  );
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether `p` touches the annotation, with `slop` points of tolerance. */
export function hitTest(a: Annotation, p: Point, slop: number) {
  if (a.type === 'ink') {
    if (a.points.length === 1) return Math.hypot(p.x - a.points[0].x, p.y - a.points[0].y) <= slop;
    return a.points.some(
      (point, i) => i > 0 && distanceToSegment(p, a.points[i - 1], point) <= slop + a.width / 2,
    );
  }
  if (a.type === 'line') return distanceToSegment(p, a.from, a.to) <= slop + a.strokeWidth;
  return containsPoint(bounds(a), p, slop);
}

/** Topmost annotation under `p`, if any. */
export function findAnnotationAt(annotations: Annotation[], p: Point, slop: number) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hitTest(annotations[i], p, slop)) return annotations[i];
  }
  return null;
}

export function translate(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'ink':
      return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'line':
      return {
        ...a,
        from: { x: a.from.x + dx, y: a.from.y + dy },
        to: { x: a.to.x + dx, y: a.to.y + dy },
      };
    default:
      return { ...a, x: a.x + dx, y: a.y + dy };
  }
}

/** Whether the annotation can be resized from its bottom-right corner. */
export function isResizable(a: Annotation) {
  return a.type !== 'ink' && a.type !== 'line';
}

/**
 * Resizes an annotation by dragging its bottom-right corner by (dx, dy).
 * Images, signatures and text keep their aspect ratio.
 */
export function resize(a: Annotation, dx: number, dy: number): Annotation {
  const min = 8;
  switch (a.type) {
    case 'rect':
    case 'ellipse':
      return { ...a, w: Math.max(min, a.w + dx), h: Math.max(min, a.h + dy) };
    case 'image':
    case 'signature': {
      const scale = Math.max(min / a.w, (a.w + dx) / a.w);
      return { ...a, w: a.w * scale, h: a.h * scale };
    }
    case 'text': {
      const b = bounds(a);
      const scale = Math.max(0.2, (b.w + dx) / b.w);
      return { ...a, fontSize: Math.max(4, Math.min(200, a.fontSize * scale)) };
    }
    default:
      return a;
  }
}

/** Fits a box with the given aspect ratio inside a page, centered, at `fraction` of its width. */
export function centeredBox(
  page: { width: number; height: number },
  aspect: number,
  fraction = 0.5,
): Rect {
  let w = page.width * fraction;
  let h = w / aspect;
  if (h > page.height * fraction) {
    h = page.height * fraction;
    w = h * aspect;
  }
  return { x: (page.width - w) / 2, y: (page.height - h) / 2, w, h };
}
