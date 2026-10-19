/**
 * Editor document model.
 *
 * Annotation coordinates are in PDF points in the page's *base* orientation
 * (the page as pdf.js shows it with its own /Rotate applied, origin top-left).
 * Rotating a page in the editor adds an extra rotation on top of that, and
 * annotations rotate along with the page.
 */

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; w: number; h: number };

export type Rotation = 0 | 90 | 180 | 270;

type Base = { id: string };

/** Freehand pen or highlighter stroke. */
export type InkAnnotation = Base & {
  type: 'ink';
  points: Point[];
  color: string;
  width: number;
  opacity: number;
};

/** Rectangle or ellipse. Whiteout is a white-filled rectangle. */
export type ShapeAnnotation = Base &
  Rect & {
    type: 'rect' | 'ellipse';
    color: string;
    strokeWidth: number;
    fill: string | null;
    opacity: number;
  };

export type LineAnnotation = Base & {
  type: 'line';
  from: Point;
  to: Point;
  color: string;
  strokeWidth: number;
  arrow: boolean;
};

export type TextAnnotation = Base & {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
};

export type ImageAnnotation = Base &
  Rect & {
    type: 'image';
    /** data: URI (JPEG or PNG). */
    uri: string;
  };

/** Vector signature. Stroke points are normalized (0..1) within the box. */
export type SignatureAnnotation = Base &
  Rect & {
    type: 'signature';
    strokes: Point[][];
    color: string;
    /** Stroke width as a fraction of the box height. */
    strokeWidth: number;
  };

export type Annotation =
  | InkAnnotation
  | ShapeAnnotation
  | LineAnnotation
  | TextAnnotation
  | ImageAnnotation
  | SignatureAnnotation;

export type EditorPage = {
  /** Stable identity across reorders. */
  key: string;
  /** Index of the page in the source PDF. */
  sourceIndex: number;
  /** Extra rotation applied in the editor. */
  rotation: Rotation;
  annotations: Annotation[];
};

export type Tool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'whiteout'
  | 'eraser';

let counter = 0;
export function makeId(prefix = 'a') {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}
